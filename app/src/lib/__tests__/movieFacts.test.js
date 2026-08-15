import { describe, it, expect } from 'vitest';
import { buildFacts, MAX_FACTS, MIN_VOTE_COUNT } from '../movieFacts.js';

// Fixtures describe an invented film on purpose: every assertion below is about
// the mapping from field to sentence, and a made-up title cannot accidentally
// put a false claim about a real movie into the suite.
function fullDetails(overrides = {}) {
  return {
    id: 101,
    title: 'The Long Descent',
    original_title: 'The Long Descent',
    original_language: 'en',
    tagline: 'Some doors only open once.',
    release_date: '2019-03-01',
    runtime: 134,
    budget: 85000000,
    revenue: 711000000,
    vote_average: 8.132,
    vote_count: 12043,
    status: 'Released',
    belongs_to_collection: { id: 9, name: 'The Long Descent Collection' },
    spoken_languages: [{ iso_639_1: 'en', english_name: 'English', name: 'English' }],
    production_countries: [{ iso_3166_1: 'US', name: 'United States of America' }],
    production_companies: [{ id: 1, name: 'Meridian Pictures' }, { id: 2, name: 'Cold Harbor Films' }],
    credits: {
      cast: [
        { id: 20, name: 'Nora Vance', order: 1 },
        { id: 21, name: 'Iris Calloway', order: 0 },
        { id: 22, name: 'Tomas Reid', order: 2 },
        { id: 23, name: 'Bit Player', order: 9 },
      ],
      crew: [
        { id: 30, name: 'Ada Kirsch', job: 'Director', department: 'Directing' },
        { id: 31, name: 'Peter Nagy', job: 'Screenplay', department: 'Writing' },
        { id: 32, name: 'Helena Ford', job: 'Novel', department: 'Writing' },
        { id: 33, name: 'Sam Oduya', job: 'Original Music Composer', department: 'Sound' },
        { id: 21, name: 'Iris Calloway', job: 'Producer', department: 'Production' },
      ],
    },
    keywords: {
      keywords: [
        { id: 1, name: 'shipwreck' },
        { id: 2, name: 'survival' },
        { id: 3, name: 'aftercreditsstinger' },
        { id: 4, name: 'deep sea' },
      ],
    },
    ...overrides,
  };
}

const byId = (facts) => Object.fromEntries(facts.map((f) => [f.id, f]));
const ids = (facts) => facts.map((f) => f.id);
const text = (facts) => facts.map((f) => f.value).join(' | ');

describe('buildFacts — contract', () => {
  it('returns [] for null, undefined, and garbage without throwing', () => {
    expect(buildFacts(null)).toEqual([]);
    expect(buildFacts(undefined)).toEqual([]);
    expect(buildFacts('not a movie')).toEqual([]);
    expect(buildFacts(42)).toEqual([]);
    expect(buildFacts([])).toEqual([]);
    expect(buildFacts([{ id: 1 }])).toEqual([]);
    expect(buildFacts({})).toEqual([]);
  });

  it('emits well-formed facts: stable unique ids, a label, a value, a known kind', () => {
    const facts = buildFacts(fullDetails());
    const kinds = new Set(['credit', 'production', 'reception', 'release', 'trivia']);
    expect(facts.length).toBeGreaterThan(0);
    facts.forEach((f) => {
      expect(typeof f.id).toBe('string');
      expect(f.id).not.toBe('');
      expect(typeof f.label).toBe('string');
      expect(f.label).not.toBe('');
      expect(typeof f.value).toBe('string');
      expect(f.value).not.toBe('');
      expect(kinds.has(f.kind)).toBe(true);
    });
    expect(new Set(ids(facts)).size).toBe(facts.length);
  });

  it('is stable — the same payload builds the same list twice', () => {
    expect(buildFacts(fullDetails())).toEqual(buildFacts(fullDetails()));
  });

  it('caps the list and keeps the most interesting facts at the top', () => {
    const facts = buildFacts(fullDetails());
    expect(facts.length).toBe(MAX_FACTS);
    expect(ids(facts).slice(0, 4)).toEqual(['director', 'cast', 'writers', 'source']);
  });

  it('contains no emoji', () => {
    const facts = buildFacts(fullDetails());
    expect(text(facts)).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('buildFacts — credits', () => {
  it('names the director, the top-billed cast in billing order, and the writer', () => {
    const f = byId(buildFacts(fullDetails()));
    expect(f.director.value).toBe('Directed by Ada Kirsch');
    expect(f.director.label).toBe('Director');
    expect(f.director.kind).toBe('credit');
    // order 0, 1, 2 — not array order, and the order-9 bit part is left out
    expect(f.cast.value).toBe('Stars Iris Calloway, Nora Vance, and Tomas Reid');
    expect(f.cast.value).not.toContain('Bit Player');
    expect(f.writers.value).toBe('Written by Peter Nagy');
    expect(f.writers.label).toBe('Writer');
  });

  it('pluralizes and Oxford-comma-joins multiple directors', () => {
    const d = fullDetails();
    d.credits.crew.push({ id: 34, name: 'Lena Kirsch', job: 'Director' });
    const f = byId(buildFacts(d));
    expect(f.director.value).toBe('Directed by Ada Kirsch and Lena Kirsch');
    expect(f.director.label).toBe('Directors');
  });

  it('merges the credits into one line when the director also wrote it', () => {
    const d = fullDetails();
    d.credits.crew = [
      { id: 30, name: 'Ada Kirsch', job: 'Director' },
      { id: 30, name: 'Ada Kirsch', job: 'Screenplay' },
    ];
    const f = byId(buildFacts(d));
    expect(f.director.value).toBe('Written and directed by Ada Kirsch');
    // and the same name is not then repeated as a separate writing credit
    expect(f.writers).toBeUndefined();
  });

  it('does not merge when only one of two directors took a script credit', () => {
    const d = fullDetails();
    d.credits.crew = [
      { id: 30, name: 'Ada Kirsch', job: 'Director' },
      { id: 34, name: 'Lena Kirsch', job: 'Director' },
      { id: 30, name: 'Ada Kirsch', job: 'Screenplay' },
    ];
    const f = byId(buildFacts(d));
    expect(f.director.value).toBe('Directed by Ada Kirsch and Lena Kirsch');
    expect(f.writers.value).toBe('Written by Ada Kirsch');
  });

  it('credits the source material from the job title that names it', () => {
    const f = byId(buildFacts(fullDetails()));
    expect(f.source.value).toBe('Adapted from the novel by Helena Ford');
    expect(f.source.kind).toBe('credit');
  });

  it('emits nothing about credits when the crew and cast are missing', () => {
    const d = fullDetails({ credits: undefined });
    const facts = buildFacts(d);
    expect(byId(facts).director).toBeUndefined();
    expect(byId(facts).cast).toBeUndefined();
    expect(byId(facts).writers).toBeUndefined();
    expect(byId(facts).source).toBeUndefined();
    expect(byId(facts)['double-duty']).toBeUndefined();
    expect(text(facts)).not.toMatch(/directed|written|stars/i);
    // the non-credit facts still come through
    expect(byId(facts).runtime.value).toBe('Runs 2h 14m');
  });

  it('survives a crew of junk entries', () => {
    const d = fullDetails();
    d.credits = { crew: [null, 'nope', {}, { job: 'Director' }, { name: '   ', job: 'Director' }], cast: [null, {}] };
    const facts = buildFacts(d);
    expect(byId(facts).director).toBeUndefined();
    expect(byId(facts).cast).toBeUndefined();
    expect(facts.length).toBeGreaterThan(0);
  });
});

describe('buildFacts — double duty (only what the payload literally shows)', () => {
  it('flags a cast member who is also credited off screen', () => {
    const f = byId(buildFacts(fullDetails()));
    expect(f['double-duty'].value).toBe('Iris Calloway stars and is also credited as a producer');
    expect(f['double-duty'].kind).toBe('trivia');
  });

  it('prefers the director who turns up in the cast', () => {
    const d = fullDetails();
    d.credits.cast.push({ id: 30, name: 'Ada Kirsch', order: 5 });
    const f = byId(buildFacts(d));
    expect(f['double-duty'].value).toBe('Director Ada Kirsch also appears in the cast');
  });

  it('says nothing when no one holds two credits — no invented reunions', () => {
    const d = fullDetails();
    d.credits.crew = d.credits.crew.filter((c) => c.id !== 21);
    const facts = buildFacts(d);
    expect(byId(facts)['double-duty']).toBeUndefined();
    expect(text(facts)).not.toMatch(/reunit|\bagain\b|second time|collaborat|worked together/i);
  });

  it('does not treat two different people with the same id-less name as distinct', () => {
    const d = fullDetails();
    d.credits.crew = [
      { name: 'Ada Kirsch', job: 'Director' },
      { name: 'Ada Kirsch', job: 'Director' },
    ];
    expect(byId(buildFacts(d)).director.value).toBe('Directed by Ada Kirsch');
  });
});

describe('buildFacts — numbers', () => {
  it('formats runtime as hours and minutes', () => {
    expect(byId(buildFacts(fullDetails({ runtime: 134 }))).runtime.value).toBe('Runs 2h 14m');
    expect(byId(buildFacts(fullDetails({ runtime: 120 }))).runtime.value).toBe('Runs 2h');
    expect(byId(buildFacts(fullDetails({ runtime: 47 }))).runtime.value).toBe('Runs 47m');
  });

  it('emits no runtime when it is absent or zero', () => {
    expect(byId(buildFacts(fullDetails({ runtime: 0 }))).runtime).toBeUndefined();
    expect(byId(buildFacts(fullDetails({ runtime: null }))).runtime).toBeUndefined();
    expect(byId(buildFacts(fullDetails({ runtime: undefined }))).runtime).toBeUndefined();
  });

  it('states gross and budget side by side, never as profit', () => {
    const f = byId(buildFacts(fullDetails()));
    expect(f['box-office'].value).toBe('Grossed $711M worldwide against a budget of $85M');
    expect(f['box-office'].kind).toBe('production');
    // the budget is not then repeated as its own row
    expect(f.budget).toBeUndefined();
    expect(text(buildFacts(fullDetails()))).not.toMatch(/profit|made back|earned back|in the black/i);
  });

  it('emits nothing at all when budget and revenue are zero', () => {
    const facts = buildFacts(fullDetails({ budget: 0, revenue: 0 }));
    expect(byId(facts)['box-office']).toBeUndefined();
    expect(byId(facts).budget).toBeUndefined();
    expect(text(facts)).not.toMatch(/\$/);
  });

  it('shows the budget alone when only the budget is known', () => {
    const f = byId(buildFacts(fullDetails({ revenue: 0 })));
    expect(f.budget.value).toBe('Made on a budget of $85M');
    expect(f['box-office']).toBeUndefined();
  });

  it('shows the gross alone when only the gross is known', () => {
    const f = byId(buildFacts(fullDetails({ budget: 0 })));
    expect(f['box-office'].value).toBe('Grossed $711M worldwide');
  });

  it('formats money compactly across magnitudes', () => {
    const gross = (revenue) => byId(buildFacts(fullDetails({ revenue, budget: 0 })))['box-office'].value;
    expect(gross(1_200_000_000)).toContain('$1.2B');
    expect(gross(1_000_000_000)).toContain('$1B');
    expect(gross(85_000_000)).toContain('$85M');
    expect(gross(8_500_000)).toContain('$8.5M');
    expect(gross(750_000)).toContain('$750K');
  });
});

describe('buildFacts — reception', () => {
  it('reports the rating with its vote count once the crowd is big enough', () => {
    const f = byId(buildFacts(fullDetails()));
    expect(f.rating.value).toBe('Rated 8.1 out of 10 by 12,043 TMDB voters');
    expect(f.rating.kind).toBe('reception');
  });

  it('says nothing about a rating backed by a handful of votes', () => {
    const facts = buildFacts(fullDetails({ vote_average: 10, vote_count: 3 }));
    expect(byId(facts).rating).toBeUndefined();
    expect(text(facts)).not.toMatch(/out of 10/);
  });

  it('draws the line at the documented vote floor', () => {
    expect(byId(buildFacts(fullDetails({ vote_count: MIN_VOTE_COUNT - 1 }))).rating).toBeUndefined();
    expect(byId(buildFacts(fullDetails({ vote_count: MIN_VOTE_COUNT }))).rating).toBeDefined();
  });

  it('says nothing when the film is unrated', () => {
    expect(byId(buildFacts(fullDetails({ vote_average: 0, vote_count: 900 }))).rating).toBeUndefined();
    expect(byId(buildFacts(fullDetails({ vote_average: undefined }))).rating).toBeUndefined();
    expect(byId(buildFacts(fullDetails({ vote_count: undefined }))).rating).toBeUndefined();
  });
});

describe('buildFacts — release, language, and metadata', () => {
  it('writes the release date readably in the past tense', () => {
    const f = byId(buildFacts(fullDetails({ release_date: '2019-03-01' })));
    expect(f['release-date'].value).toBe('Released March 1, 2019');
    expect(f['release-date'].kind).toBe('release');
  });

  it('does not claim a film that has not come out yet was released', () => {
    const f = byId(buildFacts(fullDetails({ release_date: '2099-12-25' })));
    expect(f['release-date'].value).toBe('Scheduled for December 25, 2099');
  });

  it('emits no date for a missing or malformed one', () => {
    expect(byId(buildFacts(fullDetails({ release_date: '' })))['release-date']).toBeUndefined();
    expect(byId(buildFacts(fullDetails({ release_date: 'soon' })))['release-date']).toBeUndefined();
    expect(byId(buildFacts(fullDetails({ release_date: '2019-13-45' })))['release-date']).toBeUndefined();
    expect(byId(buildFacts(fullDetails({ release_date: undefined })))['release-date']).toBeUndefined();
  });

  it('names a non-English language only when TMDB itself names it', () => {
    const named = byId(buildFacts(fullDetails({
      original_language: 'ko',
      spoken_languages: [{ iso_639_1: 'ko', english_name: 'Korean', name: '한국어' }],
    })));
    expect(named.language.value).toBe('Originally in Korean');
    expect(named.language.kind).toBe('production');

    // Code present, no matching spoken_languages entry to name it — say nothing
    // rather than expand the ISO code ourselves.
    const unnamed = byId(buildFacts(fullDetails({ original_language: 'ko', spoken_languages: [] })));
    expect(unnamed.language).toBeUndefined();
  });

  it('stays quiet about the language of an English-language film', () => {
    expect(byId(buildFacts(fullDetails())).language).toBeUndefined();
  });

  it('shows the original title only when it differs from the title', () => {
    expect(byId(buildFacts(fullDetails()))['original-title']).toBeUndefined();
    const f = byId(buildFacts(fullDetails({ original_title: 'La Longue Descente' })));
    expect(f['original-title'].value).toBe('Originally titled “La Longue Descente”');
  });

  it('quotes the tagline verbatim', () => {
    const facts = buildFacts(fullDetails({ credits: undefined }));
    expect(byId(facts).tagline.value).toBe('“Some doors only open once.”');
    expect(byId(buildFacts(fullDetails({ tagline: '', credits: undefined }))).tagline).toBeUndefined();
  });

  it('names the collection without doubling the word', () => {
    expect(byId(buildFacts(fullDetails())).collection.value).toBe('Part of The Long Descent Collection');
    const f = byId(buildFacts(fullDetails({ belongs_to_collection: { id: 9, name: 'Ocean Trilogy' } })));
    expect(f.collection.value).toBe('Part of the Ocean Trilogy');
  });

  it('emits no series fact when the film stands alone', () => {
    const facts = buildFacts(fullDetails({ belongs_to_collection: null }));
    expect(byId(facts).collection).toBeUndefined();
    expect(text(facts)).not.toMatch(/part of/i);
  });

  it('flags a post-credits scene as tagged, not as verified', () => {
    const f = byId(buildFacts(fullDetails()));
    expect(f['credits-scene'].value).toBe('Tagged on TMDB as having a scene after the credits');
    const during = byId(buildFacts(fullDetails({
      keywords: { keywords: [{ id: 3, name: 'duringcreditsstinger' }] },
    })));
    expect(during['credits-scene'].value).toBe('Tagged on TMDB as having a scene during the credits');
  });

  it('lists themes from keywords, minus the credits-scene plumbing', () => {
    // Trim the higher-priority facts so the tail of the list is reachable.
    const f = byId(buildFacts({
      id: 1,
      title: 'The Long Descent',
      keywords: { keywords: [{ name: 'shipwreck' }, { name: 'survival' }, { name: 'aftercreditsstinger' }, { name: 'deep sea' }] },
    }));
    expect(f.themes.value).toBe('Tagged with shipwreck, survival, and deep sea');
  });

  it('reads keywords in either shape TMDB returns', () => {
    const asResults = byId(buildFacts({ id: 1, keywords: { results: [{ name: 'heist' }] } }));
    expect(asResults.themes.value).toBe('Tagged with heist');
    const asArray = byId(buildFacts({ id: 1, keywords: [{ name: 'heist' }] }));
    expect(asArray.themes.value).toBe('Tagged with heist');
    expect(byId(buildFacts({ id: 1, keywords: null })).themes).toBeUndefined();
  });

  it('labels production countries as production and never as a shooting location', () => {
    const facts = buildFacts({
      id: 1,
      production_countries: [{ name: 'United States of America' }, { name: 'Hungary' }],
      production_companies: [{ name: 'Meridian Pictures' }, { name: 'Cold Harbor Films' }],
    });
    const f = byId(facts);
    expect(f.countries.value).toBe('Produced in the United States of America and Hungary');
    expect(f.countries.kind).toBe('production');
    expect(f.companies.value).toBe('Made by Meridian Pictures and Cold Harbor Films');
    expect(text(facts)).not.toMatch(/filmed|shot in|shooting|on location/i);
  });

  it('credits the composer', () => {
    const f = byId(buildFacts({
      id: 1,
      credits: { crew: [{ id: 33, name: 'Sam Oduya', job: 'Original Music Composer' }] },
    }));
    expect(f.composer.value).toBe('Score by Sam Oduya');
  });
});

describe('buildFacts — a nearly empty payload invents nothing', () => {
  it('returns only what the two present fields support', () => {
    const facts = buildFacts({ id: 7, title: 'Untitled', runtime: 95 });
    expect(ids(facts)).toEqual(['runtime']);
    expect(facts[0].value).toBe('Runs 1h 35m');
  });

  it('returns [] when every field is empty, zero, or null', () => {
    expect(buildFacts({
      id: 7,
      title: '',
      original_title: '',
      tagline: '',
      overview: '',
      release_date: '',
      runtime: 0,
      budget: 0,
      revenue: 0,
      vote_average: 0,
      vote_count: 0,
      belongs_to_collection: null,
      production_countries: [],
      production_companies: [],
      spoken_languages: [],
      credits: { cast: [], crew: [] },
      keywords: { keywords: [] },
    })).toEqual([]);
  });

  it('does not throw on fields of the wrong type', () => {
    expect(() => buildFacts({
      id: 7,
      runtime: 'two hours',
      budget: '85000000',
      revenue: {},
      vote_average: 'good',
      vote_count: [],
      belongs_to_collection: 'yes',
      credits: 'none',
      keywords: 'none',
      production_countries: 'USA',
      release_date: 12345,
    })).not.toThrow();
    expect(buildFacts({ id: 7, runtime: 'two hours', credits: 'none' })).toEqual([]);
  });
});
