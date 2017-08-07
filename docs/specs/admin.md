## Admin Dashboard

### Stories

* I should be able to see all currently running scrape processes, and trigger more at will
* I should be able to see the current transaction volume, all active contracts, and total value stored in those contracts, in Ether
* I should be able to see the total number of logged in users, and how much each user has in contracts
* I should be able to see the total value of the House account

### Backend Routes

* Connect celery beta with the main application
* transaction() and volume()
* user_info()
* house_account()

### Frontend Detail

* Sortable tables for everything
* Pusher integration for realtime updates

### Possible User-caused Bugs

* This is an admin page, don't worry about it