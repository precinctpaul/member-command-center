# Member Command Center Profile Schema Notes

## Proof Build v0.7

The app currently supports two profile shapes:

1. Legacy proof-profile shape
2. Hardened v0.7 profile-template shape

This is intentional.  Do not force a destructive migration until more profiles have been added and tested.

## Core principle

Every profile should eventually answer five operational questions:

1. Who is this person?
2. What office do they hold?
3. What can we prove from source data?
4. What is missing or risky?
5. Which modules are ready, partial, empty, or API-ready?

## Current profile file

```text
data/people.json