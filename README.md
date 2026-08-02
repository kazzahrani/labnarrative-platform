# LabNarrative Platform

Multi-tenant scientific laboratory website platform for LabNarrative.

## Version 0.1

This first proof of concept demonstrates:

- one Next.js application;
- two PI content records;
- shared page components;
- separate visual themes;
- routes for home, research, team and publications;
- host-based rewriting prepared for future `name.labnarrative.com` subdomains.

## Preview routes

- `/sites/bourdon`
- `/sites/chen`

## Current limitation

The content is temporarily stored in `lib/sites.ts`. The next milestone will move site content into Supabase and introduce secure administration.
