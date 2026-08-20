# Gaucho Rocket Project Website

A Jekyll site, ready for GitHub Pages, for ucsbrocketry.space.

## What's included
- Home, About, Contact, and 3 project pages (Halo, Jayis, Sonus)
- Full CSS (dark/SpaceX-style theme, gold accent, mobile nav, dropdowns, all classes used by the pages)
- 404 page, example blog post, CNAME for your custom domain

## Deploy to GitHub Pages

1. **Create a repo** on github.com (Public). Name doesn't matter — the CNAME file handles your domain.
2. **Push these files** to the repo (either drag-and-drop upload on github.com, or with git):
   ```bash
   git init
   git add .
   git commit -m "Initial site"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
3. **Enable Pages**: repo → Settings → Pages → Source: "Deploy from a branch" → Branch: `main`, folder `/ (root)`.
4. **Custom domain**: still in Settings → Pages, enter `ucsbrocketry.space` in the custom domain box, save. (The CNAME file in this repo already sets this too — don't duplicate/conflict, GitHub will just confirm it.)
5. **DNS at your registrar** (wherever you bought ucsbrocketry.space), add:
   ```
   Type: A     Name: @      Value: 185.199.108.153
   Type: A     Name: @      Value: 185.199.109.153
   Type: A     Name: @      Value: 185.199.110.153
   Type: A     Name: @      Value: 185.199.111.153
   Type: CNAME Name: www    Value: YOUR_USERNAME.github.io
   ```
   DNS can take minutes to a few hours to propagate.
6. Back in Settings → Pages, check **Enforce HTTPS** once the domain shows as verified (may take a bit).

## Before it looks "done"
- Add your real photos to `assets/img/` (see the README.txt in that folder for exact filenames)
- Replace every `[bracketed placeholder]` in the .html files with real content
- Swap `YOUR_HANDLE` in the footer/contact for your real Instagram/LinkedIn

## Test locally (optional, needs Ruby/Jekyll installed)
```bash
bundle exec jekyll serve
```
Then visit http://localhost:4000
