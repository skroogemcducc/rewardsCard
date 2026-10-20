# Use an activity ledger for rewards

The authoritative rewards state is an append-only history of credit additions, earned rewards, redemptions, and corrections in a hosted relational database. Current totals may be stored as derived values for efficient reads, but every balance must remain explainable from the activity history; this costs more modeling than mutable counters but makes duplicate protection, recovery, and corrections reliable.
