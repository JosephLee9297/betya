from application.models import Offer, Outcome, Bid, User
from index import db
from datetime import datetime
import random
import arrow
import math

ODDS_MIN = 1
ODDS_MAX = 12

COVERAGE_MIN = 0.005
COVERAGE_MAX = 10

OFFERS_MIN = 1
OFFER_MAX = 10

TEST_USER = {
    "email": "test@user.com",
    "password": "something1",
    "handle": "testuser",
    "avatar_url": "http://avatar.3sd.me/100"
}


def random_odds():
    rand = random.random()
    return ODDS_MIN + ((ODDS_MAX - ODDS_MIN) * rand)

def random_coverage():
    rand = random.random()
    return COVERAGE_MIN + ((COVERAGE_MAX - COVERAGE_MIN) * rand)

def random_offers():
    rand = random.random()
    return int(OFFERS_MIN + ((OFFER_MAX - OFFERS_MIN) * rand))

def offer_a_shitton(user_id):
    available_outocmes = Outcome.filter_outcomes_bisect(datetime.now(), False, True, False, False)
    for outcome in available_outocmes:
        for i in xrange(0, random_offers()):
            offer = Offer(user_id, outcome['id'], random_odds(), random_coverage())
            db.session.add(offer)
    db.session.commit()

def bid_a_shitton(user_id):
    available_outocmes = Outcome.filter_outcomes_bisect(datetime.now(), False, True, True, False)
    for outcome in available_outocmes:
        for offer in outcome['offers']:
            remaining_coverage = offer['id'].remaining_coverage
            if remaining_coverage > 0:
                bid_size = int(math.floor(random.random() * float(remaining_coverage)))
                bid = Bid(offer['id'], user_id, bid_size)
                db.session.add(bid)
                print "made bid at", bid.value, "on", offer['id']
            else:
                print "could not made bid on", offer['id']

    db.session.commit()

def make_random_bidder():
    random_user = TEST_USER
    random_user['handle'] = str(arrow.utcnow())
    random_user['email'] = str(arrow.utcnow()) + '@test.com'
    user = User(random_user['email'], random_user['password'], \
        random_user['handle'], random_user['avatar_url'])
    db.session.add(user)
    db.session.commit()
    return User.query.filter_by(email=user.email).first().id

def go():
    user_id = make_random_bidder()
    offer_a_shitton(user_id)
    user_id = make_random_bidder()
    bid_a_shitton(user_id)
