## Ticker View

### Stories

* I should be able to see all upcoming events, filtered by a specific type, and the outcomes affiliated with those events. The outcoems should be sortable by different criteria (most offers, most bids, etc.)
* I should be able to search by event name for a specific event, or date, etc.
* I should be able to filter by events that I am currently vested in
* I should be able to distinguish between events that have closed and those that are in the future

### Backend Routes

* get_events is a starting point
* Filter by various criteria
* sort by various criteria (too heavy for frontend)
* closed vs open
* search by name, date, etc.

### Frontend Detail

* Pusher integration for realtime updates
* Can't be too burdensome on the browser
* Can't be spammed for DoS attack (rate limit)

### Possible User-caused Bugs

* Invalid filter date
* $eval{} inside of filter query string
