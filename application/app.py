import datetime
from flask import request, render_template, jsonify, url_for, redirect, g, abort
from .models import User, Offer, Bid, Event, Outcome
from index import app, db
from sqlalchemy.exc import IntegrityError
from .utils.auth import generate_token, requires_auth, verify_token
from .utils.pusher import *
from .scrape.sportradar import sportradar_seed_games
from .seed import offer_generator
import arrow

@app.route("/api/user", methods=["GET"])
@requires_auth
def get_user():
    return jsonify(result=g.current_user)

@app.route("/api/dashboard", methods=["GET"])
@requires_auth
def get_dashboard():
    return jsonify(User.get_dashboard(g.current_user))

@app.route("/api/create_user", methods=["POST"])
def create_user():
    incoming = request.get_json()
    user = User(incoming["email"], incoming["password"], \
                incoming.get("handle"), incoming.get("avatar_url"))
    db.session.add(user)

    try:
        db.session.commit()
    except IntegrityError:
        return jsonify(message="User with that email already exists"), 409

    new_user = User.query.filter_by(email=incoming["email"]).first()

    return jsonify(
        id=user.id,
        token=generate_token(new_user)
    )


@app.route("/api/get_token", methods=["POST"])
def get_token():
    incoming = request.get_json()
    user = User.get_user_with_email_and_password(incoming["email"], incoming["password"])
    if user:
        return jsonify(token=generate_token(user))

    return jsonify(error=True), 403


@app.route("/api/is_token_valid", methods=["POST"])
def is_token_valid():
    incoming = request.get_json()
    is_valid = verify_token(incoming["token"])

    if is_valid:
        return jsonify(token_is_valid=True)
    else:
        return jsonify(token_is_valid=False), 403

@app.route('/api/seed/events', methods=['POST'])
def seed_games():
    start = datetime.datetime.now()
    end = start + datetime.timedelta(days=10)
    sportradar_seed_games(start, end)
    return "OK", 200

@app.route('/api/seed/bids', methods=['POST'])
def seed_bids():
    offer_generator.go()
    return "OK", 200

@app.route('/api/events', methods=['GET'])
@requires_auth
def get_events():
    return jsonify(Event.get_events())

@app.route('/api/outcome', methods=['GET'])
@requires_auth
def get_spread():
    spread = Outcome.get_spread(request.args.get('outcome_id'))
    if not spread:
        abort(404)
    else:
        return jsonify(spread)

@app.route('/api/outcomes', methods=['GET'])
@requires_auth
def get_outcomes():
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    on_date = request.args.get('on_date')
    before_date = request.args.get('before_date')
    after_date = request.args.get('after_date')
    is_open = request.args.get('is_open')
    with_offers = request.args.get('with_offers')
    with_bids = request.args.get('with_bids')
    result = None
    if start_date and end_date:
        start_date = arrow.get(start_date).datetime
        end_date = arrow.get(end_date).datetime
        result = Outcome.filter_outcomes_range(start_date, end_date,
                                           is_open, with_offers, with_bids)
    elif on_date:
        on_date = arrow.get(on_date).datetime
        result = Outcome.filter_outcomes_day(on_date,
                                         is_open, with_offers, with_bids)
    elif before_date:
        before_date = arrow.get(before_date).datetime
        result = Outcome.filter_outcomes_bisect(before_date, True,
                                            is_open, with_offers, with_bids)
    elif after_date:
        after_date = arrow.get(after_date).datetime
        result = Outcome.filter_outcomes_bisect(after_date, False,
                                            is_open, with_offers, with_bids)
    if result:
        return jsonify(result)
    else:
        abort(404)

@app.route("/api/bids", methods=["GET"])
@requires_auth
def get_bids_for_offer():
    offer_id = request.args.get('offer_id')
    if offer_id:
        result = Offer.get_bids(offer_id)
        if result:
            return jsonify(result)
        else:
            abort(404)
    else:
        abort(404)

@app.route("/api/offers", methods=["GET"])
@requires_auth
def get_offers_for_event():
    event_id = request.args.get('event_id')
    if event_id:
        result = Event.get_offers(event_id)
        if result:
            return jsonify(result)
        else:
            abort(404)
    else:
        abort(404)

@app.route('/api/offer', methods=['POST'])
@requires_auth
def make_offer():
    json = request.get_json()
    user_id = g.current_user['id']
    if 'outcome_id' not in json or 'odds' not in json or 'coverage' not in json:
        abort(403)
    offer = Offer(user_id, json['outcome_id'], json['odds'], json['coverage'])
    db.session.add(offer)
    db.session.commit()
    return jsonify({'hash': offer.hash})

@app.route('/api/bid/aggregate', methods=['POST'])
@requires_auth
def make_aggregate_bid():
    json = request.get_json()
    user_id = g.current_user['id']
    outcome_id = json.get('outcome_id')
    odds = json.get('odds')
    amount = json.get('amount')
    print json
    if not outcome_id or not odds or not amount:
        abort(401)
    if not user_id:
        abort(403)
    try:
        offers = Bid.aggregate_offers(outcome_id, odds, amount)
    except AssertionError:
        abort(404)
    bid_hashes = []
    for offer in offers:
        bid = Bid(offer['id'], user_id, float(offer['amount']))
        Bid.make_bid(bid)
        bid_hashes.append({
            'offer_tx': offer['tx_hash'],
            'bid_hash': bid.hash,
            'value': bid.value
        })
    db.session.commit()
    return jsonify({'bids': bid_hashes})

@app.route('/api/bid', methods=['POST'])
@requires_auth
def make_bid():
    json = request.get_json()
    user_id = g.current_user['id']
    if 'offer_id' not in json or 'value' not in json:
        abort(403)
    bid = Bid(json['offer_id'], user_id, float(json['value']))
    Bid.make_bid(bid)
    db.session.commit()
    return "OK", 200

@app.route('/api/bid/confirm', methods=['POST'])
@requires_auth
def confirm_bid():
    json = request.get_json()
    user_id = g.current_user['id']
    print json
    for bid in json:
        if 'bid_hash' not in bid or 'tx_hash' not in bid:
            abort(401)
        try:
            result = Bid.confirm(bid['bid_hash'], bid['tx_hash'], user_id)
        except AssertionError:
            abort(401)
        if not result:
            abort(404)
    db.session.commit()
    bid_added(result.offer.outcome_id)
    return "OK", 200

@app.route('/api/offer/confirm', methods=['POST'])
@requires_auth
def confirm_offer():
    json = request.get_json()
    user_id = g.current_user['id']
    print json
    if 'offer_hash' not in json or 'tx_hash' not in json:
        abort(403)
    try:
        result = Offer.confirm(json['offer_hash'], json['tx_hash'], user_id)
    except AssertionError:
        abort(401)
    if not result:
        abort(404)
    db.session.commit()
    offer_added(result.outcome_id)
    return "OK", 200

@app.route('/api/win', methods=['GET'])
def check_hash():
    offer_hash = request.args.get('offer_hash')
    if offer_hash == 'testHash':
        return jsonify({
            'win': 1
        })
    else:
        offer = Offer.find_by_hash(offer_hash)
        if not offer:
            abort(404)
        val = 0
        if offer.is_win:
            val = 2
        elif offer.is_win == False:
            # have to check this because could be null
            val = 1
        return jsonify({
            'win': val
        })

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def index(path):
    return render_template('index.html')
