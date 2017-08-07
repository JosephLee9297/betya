from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from config import BaseConfig
from application.utils.celery_config import make_celery
from flask_bcrypt import Bcrypt
import pusher
import simplejson

app = Flask(__name__, static_folder="./static/dist", template_folder="./static")
app.config.from_object(BaseConfig)
db = SQLAlchemy(app)
bcrypt = Bcrypt(app)

pusher_client = pusher.Pusher(
    app_id=BaseConfig.PUSHER_APP_ID,
    key=BaseConfig.PUSHER_KEY,
    secret=BaseConfig.PUSHER_SECRET,
    ssl=True
)

# celery = make_celery(app)