import streamlit_authenticator as stauth
import yaml
from yaml.loader import SafeLoader
import streamlit as st

print("✅ Streamlit Authenticator imported successfully")

# Mock config
config = {
    'credentials': {
        'usernames': {
            'jsmith': {
                'email': 'jsmith@gmail.com',
                'name': 'John Smith',
                'password': '123' # logic to hash needs to be tested
            }
        }
    },
    'cookie': {
        'expiry_days': 30,
        'key': 'some_signature_key',
        'name': 'some_cookie_name'
    },
    'preauthorized': {
        'emails': ['melsby@gmail.com']
    }
}

try:
    authenticator = stauth.Authenticate(
        config['credentials'],
        config['cookie']['name'],
        config['cookie']['key'],
        config['cookie']['expiry_days'],
        config['preauthorized']
    )
    print("✅ Authenticator initialized successfully")
except Exception as e:
    print(f"❌ Authenticator init failed: {e}")
