from application.models import Outcome

class BaseAdapter(object):
 
    def __init__(self, type_id):
        self.type_id = type_id

    def assign_name(self, data):
        raise ValueError("Unimplemented")

    def verify(self, data):
        raise ValueError("Unimplemented")

    def complete(self, data):
        result = self.verify(data)
        outcomes = self.get_outcomes()
        for outcome in outcomes:
            outcome.is_open = False
            offers = outcome.get_valid_offers()
            for offer in offers:
                offer.is_win = not result
            bids = outcome.get_valid_bids()
            for bid in bids:
                bid.is_win = result

    def get_outcomes(self):
        return Outcome.query.filter_by(type_id=self.type_id).all()
