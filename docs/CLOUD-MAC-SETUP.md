# Cloud Mac setup — fallback option (only if GitHub Actions doesn't work)

> **Heads up (2026-04-25)**: Charlie chose the **GitHub Actions** path instead. This doc is preserved as a fallback in case CI signing setup doesn't work out. See `docs/IOS-CERT-SETUP-WINDOWS.md` and `docs/PHASE-2-LAUNCH.md` for the primary path.

You don't have a local Mac. If you're going to rent one anyway, here's how. Sign up takes ~10 minutes, provisioning takes ~30–60 minutes for the first machine. **You'll spend $29-30/mo until you stop renting.**

## Quick comparison

| Feature | MacStencil | MacinCloud |
|---------|-----------|------------|
| Lowest plan | $29/mo (Standard) | $30/mo (Managed Server) |
| Persistent storage | ✅ (your data persists between sessions) | ✅ |
| Connection | VNC + SSH | RDP-like web client + VNC |
| Xcode preinstalled | Yes | Yes |
| Cancel anytime | Yes | Yes (monthly) |
| Bandwidth | Unmetered | 100GB/mo |
| Best for | Devs who want SSH + comfortable with VNC | Devs who want a familiar remote-desktop UI |

## Recommendation

**Start with MacStencil** ($29/mo). The SSH access matters more than you think — you'll want to scp your TMDB API key onto the box without re-typing it through a VNC clipboard.

If MacStencil's VNC feels janky on your network, switch to MacinCloud. Both have month-to-month plans; you're not locked in.

---

## MacStencil signup

1. Go to https://www.macstadium.com/macstencil — wait, MacStencil specifically: https://www.macstencil.com/
   - (MacStadium is the parent; MacStencil is the entry-tier product)
2. Click **Get Started** → choose the **Standard** plan ($29/mo)
3. Sign up with email + password
4. Add billing
5. Confirm email
6. Wait for provisioning email — typically 30–60 min, sometimes faster

Your provisioning email will include:
- VNC connection string + password
- SSH host + username
- Recommended VNC client (RealVNC Viewer for Windows is free)

---

## MacinCloud signup (alternative)

1. Go to https://www.macincloud.com/
2. Choose **Managed Server** → smallest plan (~$30/mo)
3. Sign up + billing + verify
4. Their dashboard gives you a web client (no VNC software needed) plus optional VNC details

---

## First login (regardless of provider)

Once you connect:

1. **Update macOS** if there's a pending update (Apple often pushes Xcode updates that require the latest macOS)
2. **Open Mac App Store** → search "Xcode" → install or update (this is the slow part — 10–20 GB)
3. While Xcode installs, run in Terminal:
   ```bash
   xcode-select --install
   ```
   This installs the command-line tools (separate from the Xcode app).

4. Install Homebrew:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

5. Install Node 20 via nvm:
   ```bash
   brew install nvm
   mkdir ~/.nvm
   echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
   echo '[ -s "$(brew --prefix nvm)/nvm.sh" ] && \. "$(brew --prefix nvm)/nvm.sh"' >> ~/.zshrc
   source ~/.zshrc
   nvm install 20
   nvm use 20
   nvm alias default 20
   node --version  # should print v20.x.x
   ```

6. Install CocoaPods:
   ```bash
   sudo gem install cocoapods
   pod --version  # should print 1.x.x
   ```

7. Install Git config (if not already):
   ```bash
   git config --global user.name "Charlie Cresci"
   git config --global user.email "crescicharles@gmail.com"
   ```

8. Install GitHub CLI (handy for cloning your private repo):
   ```bash
   brew install gh
   gh auth login
   # follow the prompts; pick HTTPS, paste a personal access token
   ```

---

## Verify setup

Run:
```bash
echo "Xcode: $(xcodebuild -version | head -1)"
echo "Node:  $(node --version)"
echo "npm:   $(npm --version)"
echo "Pod:   $(pod --version)"
echo "Git:   $(git --version)"
echo "Brew:  $(brew --version | head -1)"
```

You should see versions for all six. If any are missing, scroll back and re-run that step.

---

## What's next

Once Xcode is installed and the tools above are working, follow `docs/PHASE-2-LAUNCH.md` from "Day 2 onward."

Specifically:
1. Clone the scaffold repo from GitHub (see `docs/SCAFFOLD-TO-GITHUB.md` for getting it there from your Windows side)
2. `npm install` → `npm run build` → `npx cap add ios`
3. Drop in the AirPlay plugin per `app/ios-native/README.md`
4. First Xcode build to iPhone Simulator
5. First TestFlight upload

---

## Cost-saving tips

- Pause/cancel the rental between work sessions if you go a week+ without touching it. MacStencil prorates monthly.
- Build artifacts can be huge — clean `~/Library/Developer/Xcode/DerivedData/` periodically (`rm -rf` is fine; Xcode regenerates).
- Don't store the TMDB key in shell history (`.zsh_history`). Put it in `.env.local` only.

## Connectivity tips

- Use an Ethernet connection if VNC feels laggy
- Reduce VNC color depth in client settings if your bandwidth is tight
- Mosh + tmux on the SSH side is dramatically better than raw ssh for long sessions
