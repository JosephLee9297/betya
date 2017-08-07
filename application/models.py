from index import db, bcrypt
from decimal import Decimal
from utils.serializer import DictSerializable
import datetime

BTC_PRECISION = 15
BTC_NUMERAL = 3

class User(db.Model, DictSerializable):
    id = db.Column(db.Integer(), primary_key=True)
    email = db.Column(db.String(255), unique=True)
    handle = db.Column(db.String(255), unique=True)
    password = db.Column(db.String(255))
    avatar_url = db.Column(db.String(255))

    wallets = db.relationship('Wallet', backref='user',
                              lazy='joined')
    offers = db.relationship('Offer', backref='user',
                             lazy='joined')
    bids = db.relationship('Bid', backref='user',
                           lazy='joined')

    def __init__(self, email, password, handle=None, avatar_url=None):
        self.email = email
        self.active = True
        if handle:
            self.handle = handle
        if avatar_url:
            self.avatar_url = avatar_url
        self.password = User.hashed_password(password)

    @staticmethod
    def hashed_password(password):
        return bcrypt.generate_password_hash(password)

    @staticmethod
    def get_dashboard(g_user):
        user = User.query.filter_by(email=g_user['email']) \
            .outerjoin(User.offers).order_by(Offer.id.desc()) \
            .outerjoin(User.bids).order_by(Bid.id.desc()) \
            .first()
        if not user:
            return None
        else:
            (active_offers, active_bids) = User.prune_active_positions(user)
            user.wallet = Wallet.serialize(user.wallets[0]) if len(user.wallets) > 0 else None
            obj = User.serialize(user)
            obj['offers'] = active_offers
            obj['bids'] = active_bids
            del obj['password']
            del obj['wallets']
            return obj

    @staticmethod
    def prune_active_positions(self):
        active_offers = []
        active_bids = []
        for offer in self.offers:
            if offer.tx_hash == None:
                continue
            if offer.outcome.is_open:
                offer_serial = Offer.serialize(offer)
                offer_serial['outcome'] = Outcome.full_serialize(offer_serial['outcome'])
                del offer_serial['user']
                del offer_serial['bids']
                active_offers.append(offer_serial)
        for bid in self.bids:
            if bid.tx_hash == None:
                continue
            if bid.offer.outcome.is_open:
                bid_serial = Bid.serialize(bid)
                bid_serial['name'] = bid.offer.outcome.name
                del bid_serial['offer']
                del bid_serial['user']
                active_bids.append(bid_serial)
        return (active_offers, active_bids)

    @staticmethod
    def get_user_with_email_and_password(email, password):
        user = User.query.filter_by(email=email).first()
        if user and bcrypt.check_password_hash(user.password, password):
            return user
        else:
            return None

class Wallet(db.Model, DictSerializable):
    id = db.Column(db.Integer(), primary_key=True)
    user_id = db.Column(db.Integer(), db.ForeignKey('user.id'))
    address = db.Column(db.String(255), unique=True)
    guid = db.Column(db.String(255), unique=True)

    def __init__(self, user_id, address, guid):
        self.user_id = user_id
        self.address = address
        self.guid = guid

    @staticmethod
    def get_user_wallet(user_id):
        return Wallet.filter_by(user_id=user_id).first()

class Event(db.Model, DictSerializable):
    id = db.Column(db.Integer(), primary_key=True)
    name = db.Column(db.String(255))
    start_date = db.Column(db.DateTime())
    guid = db.Column(db.String(255), unique=True, index=True)
    is_open = db.Column(db.Boolean())

    outcomes = db.relationship('Outcome', backref='event',
                               lazy='joined')

    def __init__(self, name, start_date, guid):
        self.name = name
        self.start_date = start_date
        self.is_open = True
        self.guid = guid

    def close_outcomes(self):
        for outcome in self.outcomes:
            outcome.close_date = datetime.datetime.now()
            outcome.is_open = False

    @staticmethod
    def get_events():
        events = Event.query.filter(Event.start_date >= datetime.datetime.now()) \
            .outerjoin(Event.outcomes) \
            .order_by(Event.start_date).all()
        serialized_events = []
        for event in events:
            outcomes = []
            for outcome in event.outcomes:
                outcome_serialized = outcome.full_serialize()
                # del outcome_serialized['event']
                outcomes.append(outcome_serialized)
            serialized = Event.serialize(event)
            serialized['outcomes'] = outcomes
            serialized_events.append(serialized)
        return serialized_events

    @staticmethod
    def get_outcomes(event_id):
        event = Event.query.get(event_id)
        if event:
            return event.outcomes
        else:
            return None

class Outcome(db.Model, DictSerializable):
    id = db.Column(db.Integer(), primary_key=True)
    event_id = db.Column(db.Integer(), db.ForeignKey('event.id'), index=True)
    type_id = db.Column(db.Integer(), index=True)
    name = db.Column(db.String(255))
    open_date = db.Column(db.DateTime())
    close_date = db.Column(db.DateTime())
    is_open = db.Column(db.Boolean())
    average_odds = db.Column(db.Numeric(precision=4, scale=2))
    total_riding = db.Column(db.Numeric(precision=BTC_PRECISION, scale=(BTC_PRECISION - BTC_NUMERAL)))

    offers = db.relationship('Offer', backref='outcome',
                             lazy='joined')

    def __init__(self, event_id, name, open_date, close_date, is_open, type_id):
        self.event_id = event_id
        self.name = name
        self.open_date = open_date
        self.close_date = close_date
        self.is_open = is_open
        self.type_id = type_id

    def get_valid_offers(self):
        offers = []
        for offer in self.offers:
            if offer.tx_hash != None:
                offers.append(offer)
        return offers

    def get_valid_bids(self):
        bids = []
        for offer in self.offers:
            if offer.tx_hash != None:
                for bid in offer.bids:
                    if bid.tx_hash != None:
                        bids.append(bid)
        return bids

    @staticmethod
    def get_spread(outcome_id):
        outcome_obj = Outcome.query.filter_by(id=outcome_id) \
            .outerjoin(Outcome.offers) \
            .outerjoin(Bid).first()
        if not outcome_obj:
            return None
        else:
            event_db = Event.query.get(outcome_obj.event_id)
            event_obj = Event.serialize(event_db)
            del event_obj['outcomes']
            outcome_dict = outcome_obj.full_serialize(True, True)
            return {
                'event': event_obj,
                'outcome': outcome_dict
            }

    def full_serialize(self, with_offers=False, with_bids=False, prune_invalid=True):
        offers = []
        if with_offers:
            for offer in self.offers:
                if offer.tx_hash == None:
                    continue
                bids = []
                if with_bids:
                    for bid in offer.bids:
                        if bid.tx_hash == None:
                            continue
                        bid_serialized = Bid.serialize(bid)
                        del bid_serialized['user']
                        del bid_serialized['offer']
                        bids.append(bid_serialized)
                offer_dict = Offer.serialize(offer)
                del offer_dict['user']
                del offer_dict['outcome']
                offer_dict['bids'] = bids
                offers.append(offer_dict)
        outcome_dict = Outcome.serialize(self)
        del outcome_dict['event']
        outcome_dict['offers'] = offers
        return outcome_dict

    @staticmethod
    def filter_outcome_optionals(results, is_open, with_offers, with_bids):
        if is_open != None:
            results = results.filter_by(is_open=is_open)
        if with_offers:
            results.outerjoin(Outcome.offers) \
                .filter(Offer.tx_hash != None)
            if with_bids:
                results.outerjoin(Bid) \
                .filter(Bid.tx_hash != None)
        outcomes = results.all()
        returned = []
        for outcome_obj in outcomes:
            serialized_outcome = outcome_obj.full_serialize(with_offers, with_bids)
            returned.append(serialized_outcome)
        return returned

    @staticmethod
    def filter_outcomes_range(start_date, end_date, is_open, with_offers, with_bids):
        results = Outcome.query.filter(Outcome.close_date >= start_date) \
            .filter(Outcome.close_date <= end_date)
        return Outcome.filter_outcome_optionals(results, is_open, with_offers, with_bids)

    @staticmethod
    def filter_outcomes_day(on_date, is_open, with_offers, with_bids):
        results = Outcome.query.filter(Outcome.close_date == on_date)
        return Outcome.filter_outcome_optionals(results, is_open, with_offers, with_bids)

    @staticmethod
    def filter_outcomes_bisect(start_date, before, is_open, with_offers, with_bids):
        if before:
            results = Outcome.query.filter(Outcome.close_date < start_date)
        else:
            results = Outcome.query.filter(Outcome.close_date >= start_date)
        return Outcome.filter_outcome_optionals(results, is_open, with_offers, with_bids)

    @staticmethod
    def get_offers(outcome_id):
        outcome = Outcome.query.get(outcome_id)
        if outcome:
            return outcome.offers
        else:
            return None

class Offer(db.Model, DictSerializable):
    id = db.Column(db.Integer(), primary_key=True)
    user_id = db.Column(db.Integer(), db.ForeignKey('user.id'), index=True)
    outcome_id = db.Column(db.Integer(), db.ForeignKey('outcome.id'), index=True)
    odds = db.Column(db.Numeric(precision=4, scale=2))
    coverage = db.Column(db.Numeric(precision=BTC_PRECISION, scale=(BTC_PRECISION - BTC_NUMERAL)))
    remaining_coverage = db.Column(db.Numeric(precision=BTC_PRECISION, scale=(BTC_PRECISION - BTC_NUMERAL)))
    hash = db.Column(db.String(255), unique=True)
    tx_hash = db.Column(db.String(255))
    is_win = db.Column(db.Boolean())

    bids = db.relationship('Bid', backref='offer',
                           lazy='joined')

    def __init__(self, user_id, outcome_id, odds, coverage):
        self.user_id = user_id
        self.outcome_id = outcome_id
        self.odds = odds
        self.coverage = coverage
        self.remaining_coverage = coverage
        self.hash = bcrypt.generate_password_hash(
            "{0}{1}{2}".format(user_id, outcome_id, datetime.datetime.now())
        )

    @staticmethod
    def find_by_hash(hash):
        return Offer.query.filter_by(hash=hash).first()

    @staticmethod
    def confirm(hash, tx_hash, user_id):
        offer = Offer.find_by_hash(hash)
        if not offer:
            return None
        if offer.tx_hash:
            raise AssertionError('Hash already assigned')
        if offer.user_id != user_id:
            raise AssertionError('User does not own this offer')
        offer.tx_hash = tx_hash
        return offer

    @staticmethod
    def get_bids(offer_id):
        offer = Offer.query.get(offer_id)
        if offer and offer.outcome.is_open:
            return offer.bids
        else:
            return None

    @staticmethod
    def max_bid(offer_id):
        offer = Offer.query.get(offer_id)
        if offer and offer.outcome.is_open:
            remaining_coverage = Offer.remaining_coverage_with_offer(offer)
            return remaining_coverage / offer.odds
        else:
            return 0

    @staticmethod
    def can_bid(offer_id):
        offer = Offer.query.filter_by(id=offer_id) \
            .join(Outcome) \
            .outerjoin(Bid) \
            .first()
        return Offer.can_bid_with_offer(offer)

    @staticmethod
    def can_bid_with_offer(offer):
        if offer:
            return offer.outcome.is_open and offer.remaining_coverage > 0
        else:
            return False

class Bid(db.Model, DictSerializable):
    id = db.Column(db.Integer(), primary_key=True)
    offer_id = db.Column(db.Integer(), db.ForeignKey('offer.id'), index=True)
    user_id = db.Column(db.Integer(), db.ForeignKey('user.id'), index=True)
    value = db.Column(db.Numeric(precision=BTC_PRECISION, scale=(BTC_PRECISION - BTC_NUMERAL)))
    is_win = db.Column(db.Boolean())
    is_paid = db.Column(db.Boolean())
    hash = db.Column(db.String(255), unique=True)
    tx_hash = db.Column(db.String(255))

    def __init__(self, offer_id, user_id, value):
        self.offer_id = offer_id
        self.user_id = user_id
        self.value = value
        self.is_paid = False
        self.hash = bcrypt.generate_password_hash(
            "{0}{1}{2}".format(user_id, offer_id, datetime.datetime.now())
        )

    @staticmethod
    def aggregate_offers(outcome_id, odds, coverage):
        found_offers = Offer.query.filter_by(odds=odds, outcome_id=outcome_id) \
            .filter(Offer.remaining_coverage > 0) \
            .filter(Offer.tx_hash != None) \
            .order_by(Offer.id) \
            .all()
        selected_offers = []
        satisfied_coverage = 0
        for offer in found_offers:
            if satisfied_coverage == coverage:
                break
            else:
                this_offer_coverage = min(coverage - satisfied_coverage, \
                    offer.remaining_coverage)
                satisfied_coverage += this_offer_coverage
                selected_offers.append({
                    'id': offer.id,
                    'tx_hash': offer.tx_hash,
                    'amount': this_offer_coverage
                })
        print satisfied_coverage, coverage
        if satisfied_coverage != coverage:
            raise AssertionError('Not enough coverage.')
        return selected_offers

    @staticmethod
    def make_bid(bid_object):
        if Offer.can_bid(bid_object.offer_id):
            # offer.total_riding += bid_object.value
            # if offer.outcome.total_riding is None:
            #     offer.outcome.total_riding = bid_object.value
            # else:
            #     offer.outcome.total_riding += bid_object.value
            offer = Offer.query.get(bid_object.offer_id)
            offer.remaining_coverage -= Decimal(bid_object.value)
            outcome = Outcome.query.get(offer.outcome_id)
            if not outcome.total_riding:
                outcome.total_riding = Decimal(bid_object.value)
            else:
                outcome.total_riding += Decimal(bid_object.value)
            db.session.add(bid_object)
        else:
            raise AttributeError("Cannot bid on that offer")
    
    @staticmethod
    def confirm(hash, tx_hash, user_id):
        bid = Bid.query.filter_by(hash=hash).first()
        if not bid:
            return None
        if bid.tx_hash:
            raise AssertionError('Hash already assigned')
        if bid.user_id != user_id:
            raise AssertionError('User does not own this bid')
        bid.tx_hash = tx_hash
        return bid
        
class Escrow(db.Model, DictSerializable):
    id = db.Column(db.Integer(), primary_key=True)
    offer_id = db.Column(db.Integer(), db.ForeignKey('offer.id'))
    bid_id = db.Column(db.Integer(), db.ForeignKey("bid.id"))
    wallet_id = db.Column(db.Integer(), db.ForeignKey('wallet.id'))
    comission = db.Column(db.Numeric(precision=BTC_PRECISION, scale=(BTC_PRECISION - BTC_NUMERAL)))
    value = db.Column(db.Numeric(precision=BTC_PRECISION, scale=(BTC_PRECISION - BTC_NUMERAL)))
    active = db.Column(db.Boolean())
    payout_date = db.Column(db.DateTime())
    incoming_hash = db.Column(db.String(255))

    def __init__(self, offer_id, wallet_id, bid_id, comission, value):
        self.offer_id = offer_id
        self.wallet_id = wallet_id
        self.bid_id = bid_id
        self.comission = comission
        self.value = value
        self.active = True
