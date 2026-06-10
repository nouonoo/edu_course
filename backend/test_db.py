
import pyodbc
from config import DB_CONNECTION_STRING

print("--- Пытаюсь подключиться к БД... ---")
print(f"Строка подключения: {DB_CONNECTION_STRING}")

try:
    conn = pyodbc.connect(DB_CONNECTION_STRING)
    print("✅ УСПЕХ! Подключение установлено.")
    
    cursor = conn.cursor()
    cursor.execute("SELECT @@VERSION")
    row = cursor.fetchone()
    print(f"Версия SQL Server: {row[0]}")
    
    conn.close()
except Exception as e:
    print("\n❌ ОШИБКА ПОДКЛЮЧЕНИЯ:")
    print(e)