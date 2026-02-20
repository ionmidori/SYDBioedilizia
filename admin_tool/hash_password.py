import bcrypt

password = b"admin"
hashed = bcrypt.hashpw(password, bcrypt.gensalt())
print(f"Hashed 'admin': {hashed.decode()}")
