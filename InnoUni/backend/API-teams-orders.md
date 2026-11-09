# Teams & Orders API

All routes need `Authorization: Bearer <token>`.

## Teams (`/api/teams`)
| Method | Path | Who | What |
|---|---|---|---|
| GET | `/` | any | Teams sorted by rating (topics x2 + achievements x10) |
| POST | `/` | any | Create team `{name, description?}`; creator = captain |
| POST | `/:id/join` | any | Ask to join `{anonymous?}` |
| GET | `/:id/members` | any | Active members; captain also sees pending and real names of anonymous ones |
| POST | `/:id/members/:userId/accept` | captain | Accept request |
| DELETE | `/:id/members/:userId` | captain | Remove member / decline |

## Orders (`/api/orders`)
| Method | Path | Who | What |
|---|---|---|---|
| POST | `/` | any | `{kind: course|material|tariff, item_title, amount?, note?}` -> pending |
| GET | `/mine` | any | My orders |
| GET | `/pending` | teacher | Pending orders |
| POST | `/:id/decision` | teacher | `{status: confirmed|rejected}` |

## Migrations
SQL files in `migrations/` run once each, in name order, at server start (tracked in `schema_migrations`). Add `002_name.sql` for new changes; never edit an applied file.
