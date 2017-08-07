import requests
import datetime
from blockchain import createwallet
from blockchain.wallet import Wallet
from betya.config import BaseConfig
from betya.application.models import Escrow, Bid, Wallet
from index import db, bcrypt

def btc_get_wallet_value(wallet_id):
    req = requests.get(BaseConfig.WALLET_BASE_URL.format(wallet_id))
    return btc_from_satoshi(int(req.text))

def btc_create_wallet(user_id, password):
    new_wallet = createwallet.create_wallet(password, BaseConfig.BLOCKCHAIN_KEY,
        BaseConfig.BLOCKCHAIN_SERVICE_URL, 'betya')
    wallet_db_obj = Wallet(user_id, new_wallet.address, new_wallet.identifier)
    db.session.add(wallet_db_obj)
    db.session.commit()
    return wallet_db_obj

def btc_from_satoshi(amount):
    return amount / 100000000

def btc_to_satoshi(amount):
    return 100000000 * amount

def btc_release_from_escrow(escrow_id):
    escrow = Escrow.get(escrow_id)
    if not escrow:
        raise AssertionError("Escrow invalid.")
    bid = Bid.get(escrow.bid_id)
    if not bid or bid.is_win is None:
        raise AssertionError("Bid invalid.")

    '''
    if the bid is a winning one, we send (odds * value * (1 - commision))
    to the bidder
    if the bid is a losing one, we send (value * (1 - commission))
    to the seller
    '''

    escrow_wallet = Wallet(BaseConfig.BLOCKCHAIN_ESCROW_GUID,
        BaseConfig.BLOCKCHAIN_ESCROW_PASSWORD, BaseConfig.BLOCKCHAIN_SERVICE_URL)
    if not bid.is_win:
        to_send = btc_to_satoshi(bid.value * (1 - BaseConfig.COMISSION_RATE))
        destination = Wallet.get_user_wallet(bid.offer.user_id)
    else:
        to_send = btc_to_satoshi(bid.value * bid.offer.odds * (1 - BaseConfig.COMISSION_RATE))
        destination = bid.wallet_id
    payment = escrow_wallet.send(destination, to_send)
    if not payment or not payment.tx_hash:
        raise AssertionError("Payment failed.")
    else:
        escrow.active = False
        escrow.payout_date = datetime.datetime.now()
        db.session.commit()

def btc_send_to_escrow(wallet_id, bid_id, password):
    bid = Bid.get(bid_id)
    wallet = Wallet.get(wallet_id)
    if not bid or not wallet:
        raise AssertionError("Bid or wallet invalid.")
    else:
        true_value = bid.value * (1 - BaseConfig.COMISSION_RATE)
        commision = bid.value * BaseConfig.COMISSION_RATE
        escrow = Escrow(bid.offer_id, wallet_id, bid_id, commision, true_value)
        btc_wallet = Wallet(wallet.guid, password, BaseConfig.BLOCKCHAIN_SERVICE_URL)
        payment = btc_wallet.send(BaseConfig.BLOCKCHAIN_ESCROW_ADDRESS, btc_to_satoshi(bid.value))
        if not payment or not payment.tx_hash:
            raise AssertionError("Payment failed.")
        escrow.incoming_hash = payment.tx_hash
        db.session.add(escrow)
        db.session.commit()
