## User Dashboard

### Stories

* I should be able to see all my currently active offers and bids, with deep links to the spread page for each
* I should be able to see all past (closed) offers and bids, and sort them via different metrics
* I should be able to change my handle and update my email address (with confirmation) if necessary
* I should be able to see total gain/loss

### Backend Routes

* Use dashboard to get currently active offers and bids
* Build route for historical offers and bids
* Build route and update table for total gain/loss

### Frontend Detail

* Sortable tables for everything
* Pusher integration for realtime updates

### Possible User-caused Bugs

* Dangerous string entry on handle and email
* Possible duplication of handle and email
* Concurrent logins and token invalidation
