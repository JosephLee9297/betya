import datetime
import requests
from flask import abort
from config import BaseConfig
from index import db
from application.models import Event, Outcome
from application.utils.time import date_from_string
from adapters.baseball import adapters
from sqlalchemy.exc import InvalidRequestError

def sportradar_req(route):
    url = BaseConfig.SPORTRADAR_BASE_URL + route + "?api_key=" + \
        BaseConfig.SPORTRADAR_KEY
    req = requests.get(url)
    if req.status_code != 200:
        abort(500)
    return req.json()

def sportradar_get_games(date):
    day = date.day
    month = date.month
    year = date.year
    return sportradar_req("games/{0}/{1}/{2}/schedule.json" \
        .format(year, month, day))

def sportradar_insert_game(game_data):
    for game in game_data['games']:
        name = '{0} {1} at {2} {3}'.format(
            game['away']['market'], game['away']['name'],
            game['home']['market'], game['home']['name'])
        start_date = date_from_string(game['scheduled'])
        try:
            event = Event(name, start_date, game['id'])
            db.session.add(event)
            db.session.commit()
            for adapter in adapters:
                instance = adapter()
                name = instance.assign_name(game)
                outcome = Outcome(event.id, name, datetime.datetime.now(),
                                start_date, True, adapter.type_id)
                db.session.add(outcome)
        except InvalidRequestError:
            continue # already exists
    db.session.commit()


def daterange(start_date, end_date):
    for n in range(int((end_date - start_date).days)):
        yield start_date + datetime.timedelta(n)

def sportradar_seed_games(start_date, end_date):
    for day in daterange(start_date, end_date):
        api_data = sportradar_get_games(datetime.datetime(day.year, day.month, day.day))
        sportradar_insert_game(api_data)

def sportradar_check_existing_games():
    route = 'games/{0}/summary.json'
    events = Event.query.filter(Event.start_date < datetime.datetime.now()) \
        .filter_by(is_open=True).filter(Event.guid != None).all()
    for event in events:
        this_route = route.format(event.guid)
        req = sportradar_req(this_route)
        if req['game']['status'] == 'closed':
            event.is_open = False
            for adapter in adapters:
                instance = adapter()
                instance.complete(req)
            print "expired event:", event.id
        else:
            print "in progress event", event.id
    db.session.commit()
