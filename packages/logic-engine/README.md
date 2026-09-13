the logic engine package owns grading syntax semantics and truth table answer construction

the backend repository owns the package source
the frontend installs a generated npm archive and never edits checker source
both applications import the package using the same module paths

checkers accept question answer submission partial credit points feedback and options in that order
checkers return status points and any credited component scores weights or requested feedback
omitted component weights mean equal shares
explicit component weights govern both points and stored percentages
missing translations and malformed hurley submissions earn no credit
truth table answers preserve semantic row and column order without mutating questions
unknown truth table kinds return undefined and parser errors propagate

the export script packs the source into the frontend vendor directory and updates its dependency and lockfile
the parity test compares every runtime package file with the backend source using the npm pack file list
source tests remain outside the runtime archive
missing files extra files changed source and stale installed archives fail the parity test
each repository can install and run without a sibling checkout

direct sibling imports were rejected because they require both repositories in production
a generated archive keeps independent deployments and provides one editable implementation
