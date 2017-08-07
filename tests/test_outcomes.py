from testing_config import BaseTestConfig
from application.models import User, Outcome
from test_api import TestAPI
from datetime import datetime
class OutcomesAPI(BaseTestConfig):

    def test_query_outcomes(self):
        self.headers = {
            'Authorization': self.token,
        }
        outcomes = self.app.get("/api/outcomes?after_date=" + str(datetime.now()), headers=self.headers)
        outcomes = self.app.get("/api/outcomes?on_date=" + str(datetime.now()), headers=self.headers)
        outcomes = self.app.get("/api/outcomes?before_date=" + str(datetime.now()), headers=self.headers)
        outcomes = self.app.get("/api/outcomes?start_date=" + str(datetime.now()) + "&end_date=" + str(datetime.now()), headers=self.headers)

        print outcomes