# Teams & Orders API

All routes need `Authorization: Bearer <token>`.

## Teams (`/api/teams`)
Teams are on by default. `FEATURE_TEAMS=false` closes them (every route answers 404).

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/` | any | `{teams, directions}`. Each team: `name, direction, sphere, goals, description, captain_name, created_at, members` (active), `my_status` (`active`/`pending`/null), `is_captain`, `pending_requests` (captain only) |
| GET | `/:id` | any | `{team}` with the same fields |
| POST | `/` | any | Create team `{name, direction, sphere, goals, description?}`; direction is one of `directions`; creator = captain; at most 5 teams per captain. Opener, date and member count are filled in by the server |
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

## Admin API (`/api/admin`, admin role only)
| Method | Path | What |
|---|---|---|
| GET | `/stats` | Users by role, orders by status, team count |
| GET | `/users?q=&role=` | Search users |
| POST | `/users/:id/role` | `{role}`; not your own |
| POST | `/users/:id/block` | `{blocked: true|false}`; not yourself; takes effect at next login (token lives up to 24h) |
| GET | `/teams` | Teams with captain and member count |
| GET | `/orders?status=` | All orders |

Role and block changes are written to `admin_log`. The first admin is set by hand in the database: `UPDATE users SET role='admin' WHERE email='...';`
