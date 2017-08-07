''' Config Variables '''

import os
from dotenv import load_dotenv, find_dotenv
# from setup import basedir

load_dotenv(find_dotenv())

class BaseConfig(object):
    BLOCKCHAIN_ESCROW_GUID = os.environ.get('BLOCKCHAIN_ESCROW_GUID') or 'test'
    BLOCKCHAIN_ESCROW_PASSWORD = os.environ.get('BLOCKCHAIN_ESCROW_PASSWORD') or 'test'
    BLOCKCHAIN_ESCROW_ADDRESS = os.environ.get('BLOCKCHAIN_ESCROW_ADDRESS') or 'test'
    BLOCKCHAIN_SERVICE_URL = "https://localhost:6969/"
    BLOCKCHAIN_KEY = os.environ.get('BLOCKCHAIN_KEY')
    COMISSION_RATE = 0.05
    WALLET_BASE_URL = 'https://blockchain.info/q/addressbalance/{0}?confirmations=6'
    SPORTRADAR_BASE_URL = 'https://api.sportradar.us/mlb-t6/'
    SPORTRADAR_KEY = os.environ.get('SPORTRADAR_KEY') or 'test'
    SECRET_KEY = "SO_SECURE"
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ['DATABASE_URL']
    SQLALCHEMY_TRACK_MODIFICATIONS = True
    PUSHER_KEY = os.environ.get('PUSHER_KEY_DEV')
    PUSHER_SECRET = os.environ.get('PUSHER_SECRET')
    PUSHER_APP_ID = os.environ.get('PUSHER_APP_ID')

class TestingConfig(object):
    """Development configuration."""
    TESTING = True
    DEBUG = True
    WTF_CSRF_ENABLED = False
    SQLALCHEMY_DATABASE_URI = os.environ['DATABASE_URL_DEV']
    DEBUG_TB_ENABLED = True
    PRESERVE_CONTEXT_ON_EXCEPTION = False
