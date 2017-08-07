from celery import Celery
from celery.schedules import crontab
from application.scheduled.prune import expire_outcomes, remove_stale_artifacts
from application.scrape.sportradar import sportradar_seed_games, sportradar_check_existing_games
from application.seed import offer_generator
from datetime import datetime, timedelta

app = Celery()

five_minutes = 300

@app.on_after_configure.connect
def setup_periodic_tasks(sender, **kwargs):
    sender.add_periodic_task(
        crontab(hour=0, minute=0, day_of_week=1),
        sportradar_wrapper.s(),
    )
    sender.add_periodic_task(
        crontab(hour=0, minute=0),
        complete_events_wrapper.s(),
    )
    sender.add_periodic_task(
        crontab(minute=0),
        remove_stale_artifacts_wrapper.s(),
    )

@app.task
def remove_stale_artifacts_wrapper():
    remove_stale_artifacts()

@app.task
def expire_outcomes_wrapper():
    expire_outcomes()

@app.task
def complete_events_wrapper():
    sportradar_check_existing_games()

@app.task
def sportradar_wrapper():
    start = datetime.now()
    end = start + timedelta(days=7)
    sportradar_seed_games(start, end)
