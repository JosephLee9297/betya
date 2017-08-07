from index import pusher_client

def offer_added(outcome_id):
    pusher_client.trigger('outcome-{0}'.format(outcome_id), 'new-offer', {})

def bid_added(outcome_id):
    pusher_client.trigger('outcome-{0}'.format(outcome_id), 'new-bid', {})

def event_added():
    pusher_client.trigger('event', 'new', {})