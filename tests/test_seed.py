from testing_config import BaseTestConfig
from application.models import User, Outcome
from test_api import TestAPI
from datetime import datetime

class SeedAPI(BaseTestConfig):

    def test_seed_games(self):
        self.headers = {
            'Authorization': self.token,
        }
        self.app.post('/api/seed/events')
    
    def test_seed_bids(self):
        self.headers = {
            'Authorization': self.token,
        }
        self.app.post('/api/seed/bids')