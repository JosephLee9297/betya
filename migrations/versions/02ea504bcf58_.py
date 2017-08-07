"""empty message

Revision ID: 02ea504bcf58
Revises: d0068ed3fba8
Create Date: 2017-05-20 14:13:37.477000

"""

# revision identifiers, used by Alembic.
revision = '02ea504bcf58'
down_revision = 'd0068ed3fba8'

from alembic import op
import sqlalchemy as sa


def upgrade():
    ### commands auto generated by Alembic - please adjust! ###
    op.add_column('user', sa.Column('avatar_url', sa.String(length=255), nullable=True))
    ### end Alembic commands ###


def downgrade():
    ### commands auto generated by Alembic - please adjust! ###
    op.drop_column('user', 'avatar_url')
    ### end Alembic commands ###
