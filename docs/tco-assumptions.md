## TCO Model Assumptions

These numbers are a model, not a quote. They exist to compare three architecture shapes on the same traffic and the same labor cost. AWS will not bill you this, and a payroll provider will not either. Any real decision should replace the estimates with a current bill, a current payroll band, and a two-week measurement of traffic.

Prices are AWS list prices for us-east-1, checked in October 2026, as supplied in the brief. Line items marked estimate in the question 4 table are outside that price list and are modeled. All figures are USD, excluding tax, support plans, and committed-use discounts. Instances are on-demand. A savings plan would cut compute by 20 to 40 percent and would not change the conclusion, because compute is a small part of the total.

### Base assumptions

| Assumption                           |    Current monolith |   Microservices on EKS |       Modular monolith | Basis                                                                                                                     |
| ------------------------------------ | ------------------: | ---------------------: | ---------------------: | ------------------------------------------------------------------------------------------------------------------------- |
| Monthly sessions                     |             320,000 |                320,000 |                320,000 | Mid-stage store, about 10,700 per day                                                                                     |
| Monthly orders                       |               8,000 |                  8,000 |                  8,000 | 2.5 percent conversion of sessions, rounded                                                                               |
| Average order value                  |                  60 |                     60 |                     60 | Blended across categories                                                                                                 |
| Peak requests per second             |                 120 |                    120 |                    120 | Campaign and lunchtime peaks, 5x average                                                                                  |
| Average requests per second          |                  25 |                     25 |                     25 | 2.2 million requests per day                                                                                              |
| Request mix, read                    |          60 percent |             60 percent |             60 percent | Catalog and content reads                                                                                                 |
| Request mix, cart and checkout       |          25 percent |             25 percent |             25 percent | Write-heavy, latency sensitive                                                                                            |
| Request mix, account                 |          10 percent |             10 percent |             10 percent | Auth, profile, order history                                                                                              |
| Request mix, admin and jobs          |           5 percent |              5 percent |              5 percent | Back office, exports, email                                                                                               |
| Engineering team                     |         7 engineers |            7 engineers |            7 engineers | 5 product, 1 senior, 1 lead                                                                                               |
| Blended engineering cost             |     7,500 per month |        7,500 per month |        7,500 per month | 90,000 per year, range 6,000 to 9,000                                                                                     |
| Engineering allocation to operations |            0.25 FTE |               0.75 FTE |               0.25 FTE | Includes on-call, patching, deploys, incidents                                                                            |
| Database size                        |               40 GB |                 100 GB |                 100 GB | Current is smaller because history is archived                                                                            |
| Database growth                      |      3 GB per month |         5 GB per month |         5 GB per month | Order and event volume                                                                                                    |
| Object storage                       |              200 GB |                 300 GB |                 300 GB | Images, invoices, exports                                                                                                 |
| Object storage growth                |     15 GB per month |        20 GB per month |        20 GB per month | Catalog uploads and backups                                                                                               |
| Log volume                           |     10 GB per month |        30 GB per month |        10 GB per month | Microservices multiply log sources                                                                                        |
| Internet egress                      |    200 GB per month |       300 GB per month |       300 GB per month | Images and API responses                                                                                                  |
| NAT data processing                  | None, public subnet |       300 GB per month |       100 GB per month | Private subnets, package pulls, APIs                                                                                      |
| Cross-AZ transfer                    |                None |        200 GB each way |                   None | Service-to-service and DB traffic                                                                                         |
| Availability zones, app              |                   1 |                      3 |                      2 | Minimum for the stated SLA                                                                                                |
| Availability zones, database         |                   1 |            2, Multi-AZ |   1, Multi-AZ optional | Multi-AZ doubles the instance and storage                                                                                 |
| Availability target                  |        99.5 percent |          99.95 percent |           99.5 percent | 3.6 hours, 22 minutes, 3.6 hours per month. The modular target reaches 99.9 with Multi-AZ for about 85 USD more per month |
| Environments                         |     Production only | Production and staging | Production and staging | Staging is a namespace or a small clone                                                                                   |
| Support plan                         |                None |                   None |                   None | AWS Business support has a monthly minimum and is excluded                                                                |
| Discounts                            |                None |                   None |                   None | No savings plan, no reserved instances                                                                                    |

### Traffic and growth

The model assumes 20 percent year-over-year session growth and flat conversion. Storage grows with order history, so the database line should be revisited every quarter. At 5 GB per month, the 100 GB database crosses 200 GB in about 20 months. That changes the storage line, not the architecture decision.

The peak-to-average ratio is 5x. That is the number that punishes fixed node pools and rewards either autoscaling or a queue. It is also the number that makes Lambda look attractive for spiky work. For the core checkout path, I would rather have a warm container and a predictable p95 than a cold start during a campaign.

### Labor

The blended cost of 7,500 USD per month is a planning number for a mid-level to senior engineer in a startup, including benefits and overhead. The range of 6,000 to 9,000 covers a junior-heavy team at the low end and a senior-heavy team in an expensive market at the high end. Contractor or agency rates are higher and are not modeled.

The engineering allocation is the assumption most likely to be wrong, and it is the one that decides the answer. A monolith can be operated at 0.1 FTE if it is boring and well tested. A microservices estate can consume 1.5 FTE if it has no platform owner. That is why question 4 shows the sensitivity rather than a single number.

### What is excluded

- AWS Business or Enterprise support, which is a percentage of spend and worth pricing separately.
- Disaster recovery in a second region.
- A dedicated staging cluster at production scale.
- Observability vendors priced per host or per gigabyte beyond the modeled log line.
- Third-party services such as email, search, payments, and fraud.
- The opportunity cost of the migration itself, which question 4 treats as a separate one-time line.
- Recruiting and onboarding for a platform engineer.
- Tax, currency, and committed-use discounts.

### What would change the answer

The recommendation flips toward microservices if three things happen together. The team passes 15 to 25 engineers with clear team boundaries. One module has a measured scaling curve that is at least 5x the rest of the app. And the company has a platform owner who can carry the control plane, the pipelines, and the on-call rotation without borrowing from product delivery.

The recommendation flips toward staying on one VM only if cash is so tight that an extra 135 USD per month is unaffordable. In that case the answer is still to find the 135 USD, because a single VM with untested backups is a bet the company cannot afford to lose.

### Arithmetic conventions

A month is 730 hours. A year is 12 months. Percentages are rounded to one decimal in prose and kept exact in the tables where possible. Small differences in totals are rounding, not a different model. The full line-item arithmetic is in `README.md`, Question 4.
