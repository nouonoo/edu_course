import os

JWT_SECRET_KEY = 'Your_Super_Secret_Key_Here_123!'

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
COURSES_ROOT = os.path.join(BASE_DIR, 'courses')
PHOTOS_ROOT = os.path.join(BASE_DIR, 'uploads', 'photos')
IMG_ROOT = os.path.join(PROJECT_ROOT, 'img')

DB_CONNECTION_STRING = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost;"           
    "DATABASE=LearningPlatformDB;"        
    "Trusted_Connection=yes;"     
    "TrustServerCertificate=yes;"
)
