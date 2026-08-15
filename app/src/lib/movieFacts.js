/**
 * "About this movie" facts — turns one TMDB details payload (with credits and
 * keywords appended) into a short, ordered list of things worth reading after
 * a trailer.
 *
 * THE RULE, AND IT IS THE WHOLE POINT OF THIS FILE: every value below is a
 * rephrasing of a field that is literally present in the response. Nothing is
 * inferred, embellished, or invented. A missing field produces no fact — never
 * a guess. If a fact here feels witty, the wit came from picking and phrasing a
 * true field, not from making something up. Adding a "fun" line that TMDB does
 * not actually say would be an invented claim about real people; do not.
 *
 * Pure function: no network, no DOM. The only ambient input is today's date,
 * used solely to avoid saying "Released" about a date that has not happened.
 */

/** Fact.kind is one of these five. The sheet groups and styles on them. */
const KIND = Object.freeze({
  CREDIT: 'credit',
  PRODUCTION: 'production',
  RECEPTION: 'reception',
  RELEASE: 'release',
  TRIVIA: 'trivia',
});

/** How many facts the sheet shows. Builders run in priority order and stop here. */
export const MAX_FACTS = 12;

/**
 * A rating is only meaningful with a crowd behind it — a 10.0 from three votes
 * says nothing about the film. Below this floor we show no rating at all rather
 * than a number that would mislead.
 */
export const MIN_VOTE_COUNT = 50;

const TOP_CAST = 3;
const MAX_LISTED = 3;

const WRITING_JOBS = new Set(['Writer', 'Screenplay', 'Story']);

/**
 * Crew jobs worth calling out when the person is also on screen, mapped to the
 * phrase we say. A raw job title does not always survive being dropped into a
 * sentence ("credited as a screenplay"), so each one gets a written form.
 */
const OFF_SCREEN_ROLES = new Map([
  ['Producer', 'a producer'],
  ['Executive Producer', 'an executive producer'],
  ['Writer', 'a writer'],
  ['Screenplay', 'a writer'],
  ['Story', 'a writer'],
]);

/**
 * Crew jobs that name the work a film was adapted from. The job title itself
 * is the claim ("Novel" means the film is based on that person's novel), so
 * this is a rename, not an inference.
 */
const SOURCE_JOBS = new Map([
  ['Novel', 'novel'],
  ['Book', 'book'],
  ['Short Story', 'short story'],
  ['Comic Book', 'comic book'],
  ['Graphic Novel', 'graphic novel'],
  ['Theatre Play', 'stage play'],
]);

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Builders run in this order — most interesting first — and the list is cut at
 * MAX_FACTS. Anything that returns null (its field was absent, zero, or below a
 * credibility floor) simply contributes nothing and the next builder moves up.
 */
const BUILDERS = [
  // Who made it and who is in it — the questions people actually ask first.
  buildDirector,
  buildCast,
  buildWriters,
  buildSourceMaterial,
  // Is it part of something, how long is it, is it any good.
  buildCollection,
  buildRuntime,
  buildRating,
  // These two only fire for non-English films, where they are the headline.
  buildOriginalLanguage,
  buildOriginalTitle,
  // Delight.
  buildDoubleDuty,
  buildCreditsScene,
  // Numbers, then flavor, then the deeper metadata.
  buildBoxOffice,
  buildBudget,
  buildTagline,
  buildReleaseDate,
  buildComposer,
  buildThemes,
  buildCountries,
  buildCompanies,
];

/**
 * @param {object} details TMDB /movie/{id}?append_to_response=credits,keywords
 * @returns {Array<{id: string, label: string, value: string, kind: string}>}
 *          Ordered, at most MAX_FACTS. Empty for null/garbage input. Never throws.
 */
export function buildFacts(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return [];
  let ctx;
  try {
    ctx = buildContext(details);
  } catch {
    return [];
  }
  const facts = [];
  for (const build of BUILDERS) {
    if (facts.length >= MAX_FACTS) break;
    let fact = null;
    // One malformed field must never cost the user the other eighteen facts.
    try {
      fact = build(details, ctx);
    } catch {
      fact = null;
    }
    if (fact && fact.value) facts.push(fact);
  }
  return facts;
}

/* ---------------------------------------------------------------- context - */

function buildContext(details) {
  const credits = isObject(details.credits) ? details.credits : {};
  const crew = asArray(credits.crew).filter(isPerson);
  const cast = asArray(credits.cast).filter(isPerson);
  const directors = dedupePeople(crew.filter((c) => c.job === 'Director'));
  const allWriters = dedupePeople(crew.filter((c) => WRITING_JOBS.has(c.job)));
  // Only merge the two credits into one line when EVERY director also wrote —
  // otherwise "written and directed by A and B" would credit B with a script
  // they are not on.
  const directorsWrote = directors.length > 0
    && directors.every((d) => allWriters.some((w) => samePerson(d, w)));
  const writers = directorsWrote
    ? allWriters.filter((w) => !directors.some((d) => samePerson(d, w)))
    : allWriters;
  return { crew, cast: sortByBilling(cast), directors, writers, directorsWrote };
}

/* --------------------------------------------------------------- builders - */

function buildDirector(details, ctx) {
  const names = listNames(ctx.directors.map((p) => p.name));
  if (!names) return null;
  const label = ctx.directors.length > 1 ? 'Directors' : 'Director';
  const value = ctx.directorsWrote ? `Written and directed by ${names}` : `Directed by ${names}`;
  return fact('director', label, value, KIND.CREDIT);
}

function buildCast(details, ctx) {
  const names = listNames(ctx.cast.slice(0, TOP_CAST).map((p) => p.name));
  if (!names) return null;
  return fact('cast', 'Cast', `Stars ${names}`, KIND.CREDIT);
}

function buildWriters(details, ctx) {
  const names = listNames(ctx.writers.map((p) => p.name));
  if (!names) return null;
  const label = ctx.writers.length > 1 ? 'Writers' : 'Writer';
  // "Also written by" when the director already took a script credit above.
  const value = ctx.directorsWrote ? `Also written by ${names}` : `Written by ${names}`;
  return fact('writers', label, value, KIND.CREDIT);
}

function buildSourceMaterial(details, ctx) {
  const credited = ctx.crew.find((c) => SOURCE_JOBS.has(c.job));
  if (!credited) return null;
  const kind = SOURCE_JOBS.get(credited.job);
  const authors = dedupePeople(ctx.crew.filter((c) => c.job === credited.job));
  const names = listNames(authors.map((p) => p.name));
  if (!names) return null;
  return fact('source', 'Source', `Adapted from the ${kind} by ${names}`, KIND.CREDIT);
}

/**
 * The only collaboration claim this payload can support.
 *
 * A reunion fact ("their third film together") would need each person's
 * filmography, which is not in this response — so we do not make one up and we
 * do not go fetch one to guess at. What IS literally here is the same person
 * credited twice on THIS film, which is checkable line by line.
 */
function buildDoubleDuty(details, ctx) {
  const directorOnScreen = ctx.directors.find((d) => ctx.cast.some((c) => samePerson(c, d)));
  if (directorOnScreen) {
    return fact(
      'double-duty',
      'Double duty',
      `Director ${directorOnScreen.name} also appears in the cast`,
      KIND.TRIVIA
    );
  }
  for (const actor of ctx.cast.slice(0, 6)) {
    const offScreen = ctx.crew.find((c) => samePerson(c, actor) && OFF_SCREEN_ROLES.has(c.job));
    if (offScreen) {
      return fact(
        'double-duty',
        'Double duty',
        `${actor.name} stars and is also credited as ${OFF_SCREEN_ROLES.get(offScreen.job)}`,
        KIND.TRIVIA
      );
    }
  }
  return null;
}

function buildCollection(details) {
  const name = str(isObject(details.belongs_to_collection) && details.belongs_to_collection.name);
  if (!name) return null;
  // The name is TMDB's, verbatim. We only supply the article, and not when the
  // name already brings its own ("The Lord of the Rings Collection").
  const phrase = /^(the|a|an)\s/i.test(name) ? name : `the ${name}`;
  return fact('collection', 'Series', `Part of ${phrase}`, KIND.TRIVIA);
}

/**
 * Credits-scene keywords are crowd-tagged on TMDB, so the fact is phrased as
 * what the data says ("tagged as"), not as a promise we independently checked.
 */
function buildCreditsScene(details) {
  const tags = keywordNames(details).map((k) => k.toLowerCase());
  if (tags.includes('aftercreditsstinger')) {
    return fact(
      'credits-scene',
      'Stay seated',
      'Tagged on TMDB as having a scene after the credits',
      KIND.TRIVIA
    );
  }
  if (tags.includes('duringcreditsstinger')) {
    return fact(
      'credits-scene',
      'Stay seated',
      'Tagged on TMDB as having a scene during the credits',
      KIND.TRIVIA
    );
  }
  return null;
}

function buildRuntime(details) {
  const formatted = formatRuntime(num(details.runtime));
  if (!formatted) return null;
  return fact('runtime', 'Runtime', `Runs ${formatted}`, KIND.RELEASE);
}

function buildRating(details) {
  const average = num(details.vote_average);
  const votes = num(details.vote_count);
  if (average == null || average <= 0) return null;
  if (votes == null || votes < MIN_VOTE_COUNT) return null;
  return fact(
    'rating',
    'Rating',
    `Rated ${average.toFixed(1)} out of 10 by ${formatCount(votes)} TMDB voters`,
    KIND.RECEPTION
  );
}

function buildTagline(details) {
  const tagline = str(details.tagline);
  if (!tagline) return null;
  // Verbatim, in quotes — this is the studio's own line, not ours.
  return fact('tagline', 'Tagline', `“${tagline}”`, KIND.TRIVIA);
}

function buildReleaseDate(details) {
  const raw = str(details.release_date);
  const readable = formatDate(raw);
  if (!readable) return null;
  // Past tense would be a false claim about a film that has not come out yet.
  const future = raw.slice(0, 10) > new Date().toISOString().slice(0, 10);
  const value = future ? `Scheduled for ${readable}` : `Released ${readable}`;
  return fact('release-date', 'Release date', value, KIND.RELEASE);
}

/**
 * We name the language only when TMDB names it for us in spoken_languages.
 * Expanding the ISO 639-1 code ourselves would be this module asserting
 * something the payload never said, so a code with no match emits nothing.
 */
function buildOriginalLanguage(details) {
  const code = str(details.original_language).toLowerCase();
  if (!code || code === 'en') return null;
  const match = asArray(details.spoken_languages).find(
    (l) => isObject(l) && str(l.iso_639_1).toLowerCase() === code
  );
  const name = match ? (str(match.english_name) || str(match.name)) : '';
  if (!name) return null;
  return fact('language', 'Language', `Originally in ${name}`, KIND.PRODUCTION);
}

function buildOriginalTitle(details) {
  const original = str(details.original_title);
  const title = str(details.title);
  if (!original || !title || original === title) return null;
  return fact('original-title', 'Original title', `Originally titled “${original}”`, KIND.PRODUCTION);
}

/**
 * Box office and budget are two separate real numbers and stay that way.
 *
 * Revenue minus budget is NOT profit: the studio splits the gross with
 * exhibitors and the marketing spend is nowhere in this payload. So when both
 * are present we put them side by side and let the reader do their own math —
 * we never do the subtraction and call the result profit.
 */
function buildBoxOffice(details) {
  const revenue = formatMoney(num(details.revenue));
  if (!revenue) return null;
  const budget = formatMoney(num(details.budget));
  const value = budget
    ? `Grossed ${revenue} worldwide against a budget of ${budget}`
    : `Grossed ${revenue} worldwide`;
  return fact('box-office', 'Box office', value, KIND.PRODUCTION);
}

function buildBudget(details) {
  const budget = formatMoney(num(details.budget));
  if (!budget) return null;
  // Already stated next to the gross above; don't say it twice.
  if (formatMoney(num(details.revenue))) return null;
  return fact('budget', 'Budget', `Made on a budget of ${budget}`, KIND.PRODUCTION);
}

function buildComposer(details, ctx) {
  const composers = dedupePeople(ctx.crew.filter((c) => c.job === 'Original Music Composer'));
  const names = listNames(composers.map((p) => p.name));
  if (!names) return null;
  return fact('composer', 'Music', `Score by ${names}`, KIND.CREDIT);
}

function buildThemes(details) {
  const tags = keywordNames(details).filter(
    (k) => !/^(after|during)creditsstinger$/i.test(k)
  );
  const names = listNames(tags.slice(0, MAX_LISTED));
  if (!names) return null;
  return fact('themes', 'Themes', `Tagged with ${names}`, KIND.TRIVIA);
}

/**
 * production_countries is where the production was based — NOT where the film
 * was shot. TMDB does not expose shooting locations on any endpoint, so there
 * is nothing here to build a "filmed in" fact from and we do not approximate
 * one from this field.
 */
function buildCountries(details) {
  const names = listNames(
    asArray(details.production_countries)
      .slice(0, MAX_LISTED)
      .map((c) => withArticle(str(isObject(c) && c.name)))
  );
  if (!names) return null;
  return fact('countries', 'Production', `Produced in ${names}`, KIND.PRODUCTION);
}

/**
 * Purely cosmetic: a handful of TMDB country names need a definite article to
 * read as a sentence. The name itself is passed through untouched.
 */
const NEEDS_ARTICLE = /^(United |Republic of |Netherlands$|Philippines$|Bahamas$|Czech Republic$|Russian Federation$)/;

function withArticle(name) {
  return name && NEEDS_ARTICLE.test(name) ? `the ${name}` : name;
}

function buildCompanies(details) {
  const names = listNames(
    asArray(details.production_companies).slice(0, MAX_LISTED).map((c) => isObject(c) && c.name)
  );
  if (!names) return null;
  return fact('companies', 'Studios', `Made by ${names}`, KIND.PRODUCTION);
}

/* ---------------------------------------------------------------- helpers - */

function fact(id, label, value, kind) {
  return { id, label, value, kind };
}

function isObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

function isPerson(p) {
  return isObject(p) && !!str(p.name);
}

function samePerson(a, b) {
  if (!isObject(a) || !isObject(b)) return false;
  const idA = num(a.id);
  const idB = num(b.id);
  if (idA != null && idB != null) return idA === idB;
  // No ids to match on: exact name equality only. Fuzzy matching here would be
  // us deciding two credits are the same person, which is a guess.
  return str(a.name) === str(b.name);
}

function dedupePeople(people) {
  const out = [];
  for (const p of people) {
    if (!out.some((seen) => samePerson(seen, p))) out.push(p);
  }
  return out;
}

/** Billing order ascending; entries with no order keep their original position at the end. */
function sortByBilling(cast) {
  return [...cast].sort((a, b) => {
    const oa = num(a.order);
    const ob = num(b.order);
    return (oa == null ? Number.MAX_SAFE_INTEGER : oa) - (ob == null ? Number.MAX_SAFE_INTEGER : ob);
  });
}

/** Keywords arrive as { keywords: [...] } on movies; tolerate the other shapes. */
function keywordNames(details) {
  const block = details.keywords;
  const list = Array.isArray(block)
    ? block
    : (isObject(block) ? asArray(block.keywords).concat(asArray(block.results)) : []);
  return list.map((k) => (isObject(k) ? str(k.name) : str(k))).filter(Boolean);
}

/** Oxford-comma join: "A", "A and B", "A, B, and C". */
function listNames(values) {
  const clean = [];
  for (const v of values || []) {
    const s = str(v);
    if (s && !clean.includes(s)) clean.push(s);
  }
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`;
}

function formatRuntime(minutes) {
  if (minutes == null || minutes <= 0) return '';
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** Compact money: $85M, $8.5M, $1.2B. Zero and missing amounts produce nothing. */
function formatMoney(amount) {
  if (amount == null || amount <= 0) return '';
  if (amount >= 1e9) return `$${trimDecimal(amount / 1e9)}B`;
  if (amount >= 1e6) return `$${trimDecimal(amount / 1e6)}M`;
  if (amount >= 1e3) return `$${trimDecimal(amount / 1e3)}K`;
  return `$${Math.round(amount)}`;
}

function trimDecimal(value) {
  const s = value < 10 ? value.toFixed(1) : String(Math.round(value));
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** Thousands separators without depending on the runtime's ICU data. */
function formatCount(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "2024-03-01" to "March 1, 2024". A bare year stays a bare year. */
function formatDate(iso) {
  if (!iso) return '';
  const full = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (full) {
    const year = Number(full[1]);
    const month = Number(full[2]);
    const day = Number(full[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${MONTHS[month - 1]} ${day}, ${year}`;
    }
    return '';
  }
  return /^\d{4}$/.test(iso) ? iso : '';
}
