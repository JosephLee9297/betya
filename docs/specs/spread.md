## Spread View

### Stories

* I should be able to see all offers available, with remaining coverage and total riding value
* I should be able to make a new offer at any amount (wallet allowing)
* I should be able to make a new bid at any offer (wallet allowing)
* I should be able to see what the most popular casino odds are

### Backend Routes

* Spread handles most of the work
* Need API integration (with another casino?) to provide most common odds

### Frontend Detail

* Sortable tables for everything
* Pusher integration for realtime updates
* Fault tolerance for Metamask integration - do not confirm transaction if it doesn't go through
* Verify that active ethereum network is mainnet when in production, testnet when in test

### Possible User-caused Bugs

* Transaction issues:
    * User is on wrong Ethereum network
    * User rejects Metamask window
    * Loss of connection in between four step process:
        1. Website queries to backend for offer/bid hashes
        2. Metamask sends offer/bid hashes
        3. User confirms transactions
        4. Confirmation is sent to backend to log in sql
* Input issues
    * User tries to overbid/overoffer
    * Odds are not valid
