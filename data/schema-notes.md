# Member Command Center Profile Schema Notes

## Purpose

The profile schema is designed to support a political reference and intelligence dashboard.  The first priority is everyday staff use: identity, biography, headshots, contact information, offices, handles, committees, and reliable source IDs.

The second priority is intelligence scaffolding: campaign finance, legislative mechanics, public media, geography, power mapping, alerts, and API endpoints.

## Files

### `people.json`

Contains all active profile records shown in the app.

### `profile-template.json`

A blank reusable profile template for creating new people.

### `schema-notes.md`

Explains what the major fields are for and how they should be filled.

## Top-Level Identity Fields

- `id`: Stable internal slug used by the app.
- `displayName`: Name shown in the interface.
- `preferredName`: Short/common name.
- `fullName`: Full legal or official name when known.
- `title`: Role label, such as Representative, Senator, Assemblymember.
- `party`: Political party.
- `district`: District or jurisdiction label.
- `state`: Two-letter state code when applicable.
- `officeType`: Federal, State, Local, Executive, Other.
- `jurisdiction`: Institution or governing body.
- `currentOffice`: Human-readable current office.
- `active`: Boolean active/inactive value.
- `reelectionYear`: Next known reelection year.
- `pronunciation`: Pronunciation note.
- `birthPlace`, `birthday`, `family`: Everyday reference fields.

## Profile Completion

`profileCompletion` gives a quick internal status for each major reference category.

Recommended values:

- Complete
- Partial
- Missing
- Not started
- Not applicable
- Scaffolded

## Universal Profile

`universalProfile` mirrors the most common reference fields in a clean display object.

This section should be filled before deeper intelligence modules.

## Bio Library

`bio` contains reusable bio copy:

- `oneLine`
- `short`
- `standard`
- `long`

These fields power the copy buttons in the UI.

## Headshot

`headshot` contains the primary image reference:

- `primaryUrl`
- `source`
- `altText`
- `usageNote`

## Contact and Links

- `officialLinks`: Official website, contact form, YouTube channel, PolicyNote lookup, and similar fixed links.
- `phones`: Array of labeled phone numbers.
- `offices`: Array of labeled office addresses.
- `webHandles`: Array of social handles or web identities.

## Committees

`committees` is an array of memberships.

Each item should include:

- `name`
- `role`
- `source`
- `active`

## Source Identity

`sourceIdentity` stores IDs used to connect APIs and external systems.

Common fields:

- `bioguideId`
- `fecCandidateId`
- `fecPrincipalCommitteeId`
- `policyNotePersonId`
- `policyNoteEntityId`
- `googleKnowledgeGraphMid`

Not every person will have every ID.  State and local officials may not have federal IDs.

## Intelligence Modules

The following objects are designed as collapsible sections:

- `raceContext`
- `factCheckIndex`
- `mediaTracking`
- `webClippings`
- `deepCampaignFinance`
- `legislativeMechanics`
- `verbalRecords`
- `politicalGeography`
- `powerMapping`
- `alertingInfrastructure`

These can be scaffolded before live data exists.

## API Endpoints

`sourceEndpoints` stores useful API endpoint references.  This is primarily for internal debugging and integration work.

## Proof Status

`proofStatus` gives a simple status summary for each major system area.

## Important Rule

Do not assume every person is a federal official.

Federal members may have Bioguide IDs and OpenFEC records.

State officials may require state legislative sources, state campaign finance sources, and different office/district data.

The app must gracefully display missing fields.