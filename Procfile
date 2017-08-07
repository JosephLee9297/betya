web: gunicorn main:app
dev: python manage.py runserver
worker: celery -A application.worker beat
testrpc: static/node_modules/ethereumjs-testrpc/bin/testrpc