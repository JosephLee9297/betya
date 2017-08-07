import arrow

def date_from_string(string):
    return arrow.get(string).datetime
