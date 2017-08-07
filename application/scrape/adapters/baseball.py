from generic import BaseAdapter

class NoRunsHomeAdapter(BaseAdapter):

    type_id = 0

    def __init__(self):
        super(NoRunsHomeAdapter, self).__init__(NoRunsHomeAdapter.type_id)

    def assign_name(self, data):
        if 'home' not in data:
            raise AssertionError("Data incomplete")
        return 'No Runs Scored - ' + data['home']['name']

    def verify(self, data):
        if 'game' not in data:
            raise AssertionError("Data incomplete")
        home_runs = int(data['game']['home']['runs'])
        return home_runs == 0

class NoRunsAwayAdapter(BaseAdapter):

    type_id = 1

    def __init__(self):
        super(NoRunsAwayAdapter, self).__init__(NoRunsAwayAdapter.type_id)

    def assign_name(self, data):
        if 'away' not in data:
            raise AssertionError("Data incomplete")
        return 'No Runs Scored - ' + data['away']['name']

    def verify(self, data):
        if 'game' not in data:
            raise AssertionError("Data incomplete")
        away_runs = int(data['game']['away']['runs'])
        return away_runs == 0

class GameWinHomeAdapter(BaseAdapter):

    type_id = 2

    def __init__(self):
        super(GameWinHomeAdapter, self).__init__(GameWinHomeAdapter.type_id)

    def assign_name(self, data):
        if 'home' not in data:
            raise AssertionError("Data incomplete")
        return 'Game Winner - ' + data['home']['name']

    def verify(self, data):
        if 'game' not in data:
            raise AssertionError("Data incomplete")
        home_runs = int(data['game']['home']['runs'])
        away_runs = int(data['game']['away']['runs'])
        return home_runs > away_runs

class GameWinAwayAdapter(BaseAdapter):

    type_id = 3

    def __init__(self):
        super(GameWinAwayAdapter, self).__init__(GameWinAwayAdapter.type_id)

    def assign_name(self, data):
        if 'home' not in data:
            raise AssertionError("Data incomplete")
        return 'Game Winner - ' + data['away']['name']

    def verify(self, data):
        if 'game' not in data:
            raise AssertionError("Data incomplete")
        home_runs = int(data['game']['home']['runs'])
        away_runs = int(data['game']['away']['runs'])
        return home_runs < away_runs

adapters = [NoRunsHomeAdapter, NoRunsAwayAdapter, GameWinHomeAdapter, GameWinAwayAdapter]
