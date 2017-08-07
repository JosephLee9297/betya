from index import db
from application.models import Outcome, Bid, Offer
from datetime import datetime

def expire_outcomes():
    for outcome in Outcome.query.filter(datetime.now() > \
        Outcome.close_date).all():
        outcome.is_open = False
    db.session.commit()

def remove_stale_artifacts():
    Bid.query.filter_by(tx_hash=None).delete()
    Offer.query.filter_by(tx_hash=None).delete()
    db.session.commit()