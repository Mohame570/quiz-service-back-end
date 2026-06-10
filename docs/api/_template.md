# Module Contract Template

Use this file as the base structure for any shared backend contract document in `docs/api/`.

## Contract Name

- owner module:
- sprint:
- status:
- last updated:

## Purpose

Explain what this contract is for and which flows depend on it.

## Interface Type

- HTTP endpoint
- internal service
- background event
- database contract

## Request Or Input

Describe the request body, method arguments, event payload, or input shape.

## Response Or Output

Describe the returned payload, side effects, or persisted result.

## Validation Rules

List required fields, optional fields, enums, limits, and failure cases.

## Auth Or Access Rules

State whether auth is required and which roles or callers are allowed.

## Side Effects

List important side effects such as:

- sending email
- creating delivery logs
- creating attempt-linked events
- updating another model

## Dependencies

List any dependency on:

- another module
- Prisma model
- shared enum
- environment variable

## Open Questions

List anything that still needs alignment before merge.

## Example

Add one concrete example payload or usage snippet when helpful.
