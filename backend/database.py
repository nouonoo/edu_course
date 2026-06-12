import pyodbc
from config import DB_CONNECTION_STRING
from course_manifest import is_scorable_section, load_course_manifest
from course_progress import PASS_THRESHOLD, cap_course_score, merge_section_score
from course_storage import course_has_files, resolve_course_storage
from file_uploads import photo_url

class Database:

    def __init__(self):
        self.conn_string = DB_CONNECTION_STRING
        self._tables_cache = None
        self._columns_cache = {}

    def _table_exists(self, table_name):
        if self._tables_cache is None:
            rows = self._query(
                "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'"
            )
            self._tables_cache = {row.TABLE_NAME for row in rows} if rows else set()
        return table_name in self._tables_cache

    def _column_exists(self, table_name, column_name):
        key = (table_name, column_name)
        if key not in self._columns_cache:
            row = self._query(
                """SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_NAME = ? AND COLUMN_NAME = ?""",
                (table_name, column_name),
                fetch_one=True
            )
            self._columns_cache[key] = row is not None
        return self._columns_cache[key]

    def _user_optional_columns_sql(self, alias='U'):
        cols = []
        for name in ('birthday', 'phone', 'status'):
            if self._column_exists('Users', name):
                cols.append(f'{alias}.{name}')
        return (', ' + ', '.join(cols)) if cols else ''

    def _reset_schema_cache(self):
        self._tables_cache = None
        self._columns_cache = {}

    def ensure_schema(self):
        """Создаёт недостающие таблицы/столбцы и восстанавливает storage курсов."""
        if not self._column_exists('Users', 'birthday'):
            self._query("ALTER TABLE Users ADD birthday date NULL", commit=True)
        if not self._column_exists('Users', 'phone'):
            self._query("ALTER TABLE Users ADD phone nvarchar(20) NULL", commit=True)
        if not self._column_exists('Users', 'status'):
            self._query(
                "ALTER TABLE Users ADD status nvarchar(20) NOT NULL DEFAULT N'active'",
                commit=True
            )
        if not self._column_exists('User_result', 'assignment_id'):
            self._query("ALTER TABLE User_result ADD assignment_id int NULL", commit=True)

        if not self._table_exists('Assignments'):
            self._query("""
                CREATE TABLE Assignments (
                    assignment_id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    user_id int NOT NULL,
                    course_id int NOT NULL,
                    assigned_by int NOT NULL,
                    date_from date NOT NULL,
                    date_to date NOT NULL,
                    status nvarchar(20) NOT NULL DEFAULT N'active',
                    assigned_at datetime2(7) NOT NULL DEFAULT (getdate())
                )
            """, commit=True)

        if not self._table_exists('Section_progress'):
            self._query("""
                CREATE TABLE Section_progress (
                    section_progress_id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    assignment_id int NOT NULL,
                    section_id nvarchar(50) NOT NULL,
                    score float NOT NULL DEFAULT 0,
                    first_attempt_failed bit NOT NULL DEFAULT 0,
                    updated_at datetime2(7) NOT NULL DEFAULT (getdate()),
                    CONSTRAINT UQ_Section_progress UNIQUE (assignment_id, section_id)
                )
            """, commit=True)

        if not self._table_exists('Feedback'):
            self._query("""
                CREATE TABLE Feedback (
                    feedback_id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    user_id int NOT NULL,
                    message nvarchar(max) NOT NULL,
                    created_at datetime2(7) NOT NULL DEFAULT (getdate())
                )
            """, commit=True)

        self._reset_schema_cache()

        self._query("""
            UPDATE Courses
            SET storage = N'bezopasnost'
            WHERE course_id = 2
        """, commit=True)

        admin_role = self._query(
            "SELECT TOP 1 role_id FROM Roles WHERE role_name = N'Администратор'",
            fetch_one=True
        )
        if admin_role:
            admin_user = self._query(
                "SELECT TOP 1 user_id FROM Users WHERE LOWER(email) = LOWER(N'iereevamaria')",
                fetch_one=True
            )
            if admin_user:
                has_role = self._query(
                    "SELECT TOP 1 1 FROM UserRoles WHERE user_id = ? AND role_id = ?",
                    (admin_user.user_id, admin_role.role_id),
                    fetch_one=True
                )
                if not has_role:
                    self._query(
                        "INSERT INTO UserRoles (user_id, role_id) VALUES (?, ?)",
                        (admin_user.user_id, admin_role.role_id),
                        commit=True
                    )

    def _course_payload(self, row, assignment_id=None, date_from=None, date_to=None,
                        assignment_status='active', sections_completed=0):
        storage = resolve_course_storage(row.storage, row.course_id, row.title)
        manifest = load_course_manifest(storage)
        course_type = manifest.get('course_type', 'native') if manifest else 'native'
        return {
            "course_id": row.course_id,
            "title": row.title,
            "description": row.description,
            "storage": storage,
            "course_type": course_type,
            "date": row.date.isoformat() if row.date else None,
            "assignment_id": assignment_id,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
            "assignment_status": assignment_status,
            "result": float(row.result) if getattr(row, 'result', None) is not None else 0,
            "result_date": row.result_date.isoformat() if getattr(row, 'result_date', None) else None,
            "has_storage": course_has_files(storage, row.course_id, row.title),
            "can_continue": True,
            "sections_completed": sections_completed,
            "progress_percent": float(row.result) if getattr(row, 'result', None) is not None else 0
        }

    def _get_connection(self):
        try:
            return pyodbc.connect(self.conn_string)
        except Exception as e:
            print(f"Ошибка подключения к БД: {e}")
            return None

    def _query(self, sql, params=(), fetch_one=False, commit=False):
        conn = self._get_connection()
        if not conn:
            return None
        try:
            with conn.cursor() as cursor:
                cursor.execute(sql, params)
                if commit:
                    conn.commit()
                    return True
                if fetch_one:
                    return cursor.fetchone()
                return cursor.fetchall()
        except Exception as e:
            print(f"Ошибка выполнения запроса '{sql}': {e}")
            return None
        finally:
            conn.close()

    def _execute_scalar(self, sql, params=()):
        conn = self._get_connection()
        if not conn:
            return None
        try:
            with conn.cursor() as cursor:
                cursor.execute(sql, params)
                row = cursor.fetchone()
                conn.commit()
                return row[0] if row else None
        except Exception as e:
            print(f"Ошибка выполнения запроса '{sql}': {e}")
            return None
        finally:
            conn.close()

    def _role_key(self, role_name):
        if not role_name:
            return 'student'
        role_lower = role_name.lower()
        if 'администратор' in role_lower:
            return 'admin'
        if 'эксперт' in role_lower:
            return 'expert'
        return 'student'

    def authenticate_user(self, login, password):
        login = (login or '').strip()
        sql = """
            SELECT user_id, password_hash
            FROM Users
            WHERE LOWER(LTRIM(RTRIM(email))) = LOWER(?)
        """
        user_row = self._query(sql, (login,), fetch_one=True)
        if not user_row or user_row.password_hash != password:
            return None
        if self._column_exists('Users', 'status'):
            status_row = self._query(
                "SELECT status FROM Users WHERE user_id = ?",
                (user_row.user_id,),
                fetch_one=True
            )
            if status_row and status_row.status == 'inactive':
                return None
        return user_row.user_id

    def get_user_role(self, user_id):
        sql = """
            SELECT R.role_name
            FROM Roles R
            JOIN UserRoles UR ON R.role_id = UR.role_id
            WHERE UR.user_id = ?
            ORDER BY CASE
                WHEN R.role_name = N'Администратор' THEN 1
                WHEN R.role_name = N'Эксперт' THEN 2
                ELSE 3
            END
        """
        row = self._query(sql, (user_id,), fetch_one=True)
        return self._role_key(row.role_name if row else None)

    def get_auth_session(self, user_id):
        sql = """
            SELECT TOP 1
                U.user_id, U.email, U.name, U.surname, U.patronymic,
                R.role_name
            FROM Users U
            LEFT JOIN UserRoles UR ON U.user_id = UR.user_id
            LEFT JOIN Roles R ON UR.role_id = R.role_id
            WHERE U.user_id = ?
            ORDER BY CASE
                WHEN R.role_name = N'Администратор' THEN 1
                WHEN R.role_name = N'Эксперт' THEN 2
                ELSE 3
            END
        """
        row = self._query(sql, (user_id,), fetch_one=True)
        if not row:
            return None

        role_name = row.role_name or 'Обучающийся'
        role = self._role_key(role_name)
        full_name = f"{row.surname} {row.name}"
        if row.patronymic:
            full_name = f"{row.surname} {row.name} {row.patronymic}"

        return {
            "user_id": row.user_id,
            "email": row.email,
            "full_name": full_name.strip(),
            "role": role,
            "role_name": role_name,
            "home_page": self._home_page_for_role(role)
        }

    def _home_page_for_role(self, role):
        if role == 'admin':
            return 'users.html'
        if role == 'expert':
            return 'assignments.html'
        return 'instruction.html'

    def get_user_profile(self, user_id):
        optional = self._user_optional_columns_sql('U')
        sql = f"""
            SELECT TOP 1
                U.user_id, U.name, U.surname, U.patronymic, U.email, U.photo,
                U.position_id{optional},
                P.name AS position_name, R.role_name
            FROM Users U
            LEFT JOIN Position P ON U.position_id = P.Position_id
            LEFT JOIN UserRoles UR ON U.user_id = UR.user_id
            LEFT JOIN Roles R ON UR.role_id = R.role_id
            WHERE U.user_id = ?
            ORDER BY CASE
                WHEN R.role_name = N'Администратор' THEN 1
                WHEN R.role_name = N'Эксперт' THEN 2
                ELSE 3
            END
        """
        row = self._query(sql, (user_id,), fetch_one=True)
        if not row:
            return None

        role_name = row.role_name or 'Обучающийся'
        full_name = f"{row.surname} {row.name}"
        if row.patronymic:
            full_name = f"{row.surname} {row.name} {row.patronymic}"

        progress = self.get_user_progress_summary(user_id)

        managers = []
        if self._role_key(role_name) == 'student':
            managers = self.get_student_managers(user_id)

        return {
            "user_id": row.user_id,
            "name": row.name,
            "surname": row.surname,
            "patronymic": row.patronymic,
            "full_name": full_name.strip(),
            "email": row.email,
            "photo": row.photo,
            "photo_url": photo_url(row.photo),
            "phone": getattr(row, 'phone', None),
            "birthday": row.birthday.isoformat() if getattr(row, 'birthday', None) else None,
            "status": getattr(row, 'status', 'active'),
            "position_id": row.position_id,
            "position_name": row.position_name,
            "role_name": role_name,
            "role": self._role_key(role_name),
            "completed_sections": progress['completed_sections'],
            "total_sections": progress['total_sections'],
            "managers": managers
        }

    def get_student_managers(self, user_id):
        if not self._table_exists('Assignments'):
            return []
        sql = """
            SELECT DISTINCT U.user_id, U.surname, U.name, U.patronymic
            FROM Assignments A
            JOIN Users U ON A.assigned_by = U.user_id
            WHERE A.user_id = ?
            ORDER BY U.surname, U.name
        """
        rows = self._query(sql, (user_id,))
        if not rows:
            return []
        return [
            {
                "user_id": row.user_id,
                "full_name": f"{row.surname} {row.name} {row.patronymic or ''}".strip()
            }
            for row in rows
        ]

    def get_user_progress_summary(self, user_id):
        if self._table_exists('Assignments') and self._table_exists('Section_progress'):
            sql = """
                SELECT COUNT(SP.section_progress_id) AS completed_sections
                FROM Assignments A
                JOIN Section_progress SP ON SP.assignment_id = A.assignment_id
                WHERE A.user_id = ? AND A.status = 'active'
            """
            row = self._query(sql, (user_id,), fetch_one=True)
            completed = int(row.completed_sections) if row and row.completed_sections else 0
            return {"completed_sections": completed, "total_sections": max(completed, 4)}

        row = self._query(
            "SELECT COUNT(*) AS completed FROM User_result WHERE user_id = ? AND result >= ?",
            (user_id, PASS_THRESHOLD),
            fetch_one=True
        )
        completed = int(row.completed) if row and row.completed else 0
        total_row = self._query(
            "SELECT COUNT(DISTINCT course_id) AS total FROM User_result WHERE user_id = ?",
            (user_id,),
            fetch_one=True
        )
        total = int(total_row.total) if total_row and total_row.total else 0
        return {"completed_sections": completed, "total_sections": max(total, 4)}

    def get_user_photo_filename(self, user_id):
        row = self._query("SELECT photo FROM Users WHERE user_id = ?", (user_id,), fetch_one=True)
        return row.photo if row else None

    def update_user_photo(self, user_id, photo_filename):
        return self._query(
            "UPDATE Users SET photo = ? WHERE user_id = ?",
            (photo_filename, user_id),
            commit=True
        ) is True

    def update_user_profile(self, user_id, data):
        if self._column_exists('Users', 'phone') and self._column_exists('Users', 'birthday'):
            sql = """
                UPDATE Users
                SET name = ?, surname = ?, patronymic = ?, phone = ?, birthday = ?
                WHERE user_id = ?
            """
            birthday = data.get('birthday') or None
            params = (
                data.get('name'),
                data.get('surname'),
                data.get('patronymic'),
                data.get('phone'),
                birthday,
                user_id
            )
        else:
            sql = """
                UPDATE Users
                SET name = ?, surname = ?, patronymic = ?
                WHERE user_id = ?
            """
            params = (
                data.get('name'),
                data.get('surname'),
                data.get('patronymic'),
                user_id
            )
        return self._query(sql, params, commit=True) is True

    def save_feedback(self, user_id, message):
        if not self._table_exists('Feedback'):
            return False
        sql = "INSERT INTO Feedback (user_id, message) VALUES (?, ?)"
        return self._query(sql, (user_id, message), commit=True) is True

    def _rating_course_scores_sql(self):
        return """
            SELECT UR.user_id, UR.course_id,
                   MAX(COALESCE(UR.result, 0)) AS best_score
            FROM User_result UR
            LEFT JOIN Assignments A ON UR.assignment_id = A.assignment_id
            WHERE UR.result IS NOT NULL
              AND COALESCE(UR.result, 0) > 0
              AND (
                  UR.assignment_id IS NULL
                  OR A.status IN ('active', 'passed', 'failed')
              )
            GROUP BY UR.user_id, UR.course_id
        """

    def get_rating(self):
        users_sql = f"""
            SELECT U.user_id, U.name, U.surname, U.photo,
                   COALESCE(SUM(course_scores.best_score), 0) AS total_score
            FROM Users U
            INNER JOIN (
                {self._rating_course_scores_sql()}
            ) course_scores ON U.user_id = course_scores.user_id
            GROUP BY U.user_id, U.name, U.surname, U.photo
            ORDER BY total_score DESC
        """
        courses_sql = f"""
            SELECT course_scores.user_id, course_scores.course_id, C.title,
                   course_scores.best_score
            FROM (
                {self._rating_course_scores_sql()}
            ) course_scores
            JOIN Courses C ON C.course_id = course_scores.course_id
            ORDER BY course_scores.user_id, C.title
        """
        rows = self._query(users_sql)
        if rows is None:
            return []

        course_rows = self._query(courses_sql) or []
        courses_by_user = {}
        for row in course_rows:
            courses_by_user.setdefault(row.user_id, []).append({
                "course_id": row.course_id,
                "title": row.title,
                "score": int(round(float(row.best_score))),
            })

        return [
            {
                "user_id": row.user_id,
                "name": row.name,
                "surname": row.surname,
                "total_score": int(row.total_score),
                "photo_url": photo_url(row.photo),
                "courses": courses_by_user.get(row.user_id, []),
            }
            for row in rows
        ]

    def get_report_data(self, user_id=None, course_id=None, date_from=None, date_to=None):
        sql = """
            SELECT U.surname, U.name, U.patronymic, P.name AS position_name,
                   C.title, UR.result, UR.date
            FROM User_result UR
            JOIN Users U ON UR.user_id = U.user_id
            JOIN Courses C ON UR.course_id = C.course_id
            LEFT JOIN Position P ON U.position_id = P.Position_id
            WHERE 1=1
        """
        params = []
        if user_id:
            sql += " AND U.user_id = ?"
            params.append(user_id)
        if course_id:
            sql += " AND C.course_id = ?"
            params.append(course_id)
        if date_from:
            sql += " AND UR.date >= ?"
            params.append(date_from)
        if date_to:
            sql += " AND UR.date <= ?"
            params.append(date_to)
        sql += " ORDER BY UR.date DESC"
        return self._query(sql, tuple(params))

    def get_all_users(self, search=None):
        optional = self._user_optional_columns_sql('U')
        sql = f"""
            SELECT U.user_id, U.surname, U.name, U.patronymic, U.email,
                   U.photo, U.position_id{optional},
                   P.name AS position_name, R.role_name
            FROM Users U
            LEFT JOIN Position P ON U.position_id = P.Position_id
            LEFT JOIN UserRoles UR ON U.user_id = UR.user_id
            LEFT JOIN Roles R ON UR.role_id = R.role_id
            WHERE 1=1
        """
        params = []
        if search:
            sql += " AND (U.surname LIKE ? OR U.name LIKE ? OR U.email LIKE ?)"
            pattern = f"%{search}%"
            params.extend([pattern, pattern, pattern])
        sql += " ORDER BY U.surname, U.name"
        rows = self._query(sql, tuple(params))
        if rows is None:
            return []
        return [self._format_admin_user(row) for row in rows]

    def get_admin_user(self, user_id):
        optional = self._user_optional_columns_sql('U')
        sql = f"""
            SELECT U.user_id, U.surname, U.name, U.patronymic, U.email,
                   U.photo, U.position_id{optional},
                   P.name AS position_name, R.role_name, UR.role_id
            FROM Users U
            LEFT JOIN Position P ON U.position_id = P.Position_id
            LEFT JOIN UserRoles UR ON U.user_id = UR.user_id
            LEFT JOIN Roles R ON UR.role_id = R.role_id
            WHERE U.user_id = ?
        """
        row = self._query(sql, (user_id,), fetch_one=True)
        if not row:
            return None
        return self._format_admin_user(row, include_role_id=True)

    def _format_admin_user(self, row, include_role_id=False):
        data = {
            "user_id": row.user_id,
            "full_name": f"{row.surname} {row.name} {row.patronymic or ''}".strip(),
            "surname": row.surname,
            "name": row.name,
            "patronymic": row.patronymic,
            "email": row.email,
            "phone": getattr(row, 'phone', None),
            "birthday": row.birthday.isoformat() if getattr(row, 'birthday', None) else None,
            "status": getattr(row, 'status', 'active'),
            "photo": row.photo,
            "photo_url": photo_url(row.photo),
            "position_id": row.position_id,
            "position_name": row.position_name,
            "role_name": row.role_name
        }
        if include_role_id:
            data["role_id"] = row.role_id
        return data

    def get_positions(self):
        rows = self._query("SELECT Position_id, name FROM Position ORDER BY name")
        if rows is None:
            return []
        return [{"position_id": row.Position_id, "name": row.name} for row in rows]

    def get_roles(self):
        rows = self._query("SELECT role_id, role_name FROM Roles ORDER BY role_name")
        if rows is None:
            return []
        return [{"role_id": row.role_id, "role_name": row.role_name} for row in rows]

    def _nullable_int(self, value):
        if value in (None, '', 'null'):
            return None
        return int(value)

    def create_user(self, data):
        if self._column_exists('Users', 'phone'):
            sql = """
                INSERT INTO Users (name, surname, patronymic, position_id, email, password_hash, photo, phone, birthday, status)
                OUTPUT INSERTED.user_id
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            params = (
                data['name'], data['surname'], data.get('patronymic'),
                self._nullable_int(data.get('position_id')), data['email'], data['password_hash'],
                data.get('photo'), data.get('phone'), data.get('birthday'),
                data.get('status', 'active')
            )
        else:
            sql = """
                INSERT INTO Users (name, surname, patronymic, position_id, email, password_hash, photo)
                OUTPUT INSERTED.user_id
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """
            params = (
                data['name'], data['surname'], data.get('patronymic'),
                self._nullable_int(data.get('position_id')), data['email'], data['password_hash'],
                data.get('photo')
            )
        user_id = self._execute_scalar(sql, params)
        if user_id and data.get('role_id'):
            self._query(
                "INSERT INTO UserRoles (user_id, role_id) VALUES (?, ?)",
                (user_id, data['role_id']),
                commit=True
            )
        return user_id

    def update_admin_user(self, user_id, data):
        if self._column_exists('Users', 'phone'):
            sql = """
                UPDATE Users
                SET name=?, surname=?, patronymic=?, position_id=?, email=?,
                    phone=?, birthday=?, status=?, photo=COALESCE(?, photo)
                WHERE user_id=?
            """
            params = (
                data['name'], data['surname'], data.get('patronymic'),
                self._nullable_int(data.get('position_id')), data['email'], data.get('phone'),
                data.get('birthday'), data.get('status', 'active'),
                data.get('photo'), user_id
            )
        else:
            sql = """
                UPDATE Users
                SET name=?, surname=?, patronymic=?, position_id=?, email=?
                WHERE user_id=?
            """
            params = (
                data['name'], data['surname'], data.get('patronymic'),
                self._nullable_int(data.get('position_id')), data['email'], user_id
            )
        ok = self._query(sql, params, commit=True)
        if ok and data.get('role_id'):
            self._query("DELETE FROM UserRoles WHERE user_id=?", (user_id,), commit=True)
            self._query(
                "INSERT INTO UserRoles (user_id, role_id) VALUES (?, ?)",
                (user_id, data['role_id']),
                commit=True
            )
        if ok and data.get('password_hash'):
            self._query(
                "UPDATE Users SET password_hash=? WHERE user_id=?",
                (data['password_hash'], user_id),
                commit=True
            )
        return ok is True

    def delete_user(self, user_id):
        return self._query("DELETE FROM Users WHERE user_id=?", (user_id,), commit=True) is True

    def get_all_courses(self, search=None):
        sql = "SELECT course_id, title, description, storage, date FROM Courses WHERE 1=1"
        params = []
        if search:
            sql += " AND title LIKE ?"
            params.append(f"%{search}%")
        sql += " ORDER BY title"
        rows = self._query(sql, tuple(params))
        if rows is None:
            return []
        return [
            {
                "course_id": row.course_id,
                "title": row.title,
                "description": row.description,
                "storage": row.storage,
                "date": row.date.isoformat() if row.date else None
            }
            for row in rows
        ]

    def get_course_by_id(self, course_id):
        sql = """
            SELECT course_id, title, description, author_id, date, storage
            FROM Courses WHERE course_id = ?
        """
        return self._query(sql, (course_id,), fetch_one=True)

    def create_course(self, title, description, author_id, storage):
        sql = """
            INSERT INTO Courses (title, description, author_id, storage)
            OUTPUT INSERTED.course_id
            VALUES (?, ?, ?, ?)
        """
        return self._execute_scalar(sql, (title, description, author_id, storage))

    def purge_course_data(self, course_id):
        """Удаляет назначения, прогресс и результаты по курсу, сам курс в справочнике сохраняется."""
        assignment_rows = self._query(
            "SELECT assignment_id FROM Assignments WHERE course_id=?",
            (course_id,)
        ) or []
        for row in assignment_rows:
            self._clear_assignment_traversal(row.assignment_id)

        self._query("DELETE FROM User_result WHERE course_id=?", (course_id,), commit=True)
        self._query("DELETE FROM Assignments WHERE course_id=?", (course_id,), commit=True)
        return True

    def reset_course_shell(self, course_id, storage, title=None, description=None):
        self.purge_course_data(course_id)
        if title is not None and description is not None:
            self._query(
                "UPDATE Courses SET storage=?, title=?, description=? WHERE course_id=?",
                (storage, title, description, course_id),
                commit=True
            )
        else:
            self._query(
                "UPDATE Courses SET storage=? WHERE course_id=?",
                (storage, course_id),
                commit=True
            )
        return True

    def delete_course(self, course_id):
        self.purge_course_data(course_id)
        return self._query("DELETE FROM Courses WHERE course_id=?", (course_id,), commit=True) is True

    def create_assignment(self, user_id, course_id, assigned_by, date_from, date_to):
        if not self._table_exists('Assignments'):
            self.ensure_schema()
            self._reset_schema_cache()
        if not self._table_exists('Assignments'):
            return None, 'Таблица назначений не создана. Перезапустите backend или выполните migration.sql'

        active = self.get_active_assignment(user_id, course_id)
        if active:
            return None, 'У пользователя уже есть активное назначение по этому курсу'

        failed_exists = self._query(
            "SELECT TOP 1 assignment_id FROM Assignments WHERE user_id=? AND course_id=? AND status='failed'",
            (user_id, course_id),
            fetch_one=True
        )
        if failed_exists:
            pass

        sql = """
            INSERT INTO Assignments (user_id, course_id, assigned_by, date_from, date_to, status)
            OUTPUT INSERTED.assignment_id
            VALUES (?, ?, ?, ?, ?, 'active')
        """
        assignment_id = self._execute_scalar(sql, (user_id, course_id, assigned_by, date_from, date_to))
        if not assignment_id:
            return None, 'Не удалось создать назначение'
        return assignment_id, None

    def get_active_assignment(self, user_id, course_id):
        sql = """
            SELECT TOP 1 assignment_id, user_id, course_id, date_from, date_to, status
            FROM Assignments
            WHERE user_id=? AND course_id=? AND status='active'
            ORDER BY assigned_at DESC
        """
        return self._query(sql, (user_id, course_id), fetch_one=True)

    def get_assignment_by_id(self, assignment_id):
        sql = """
            SELECT assignment_id, user_id, course_id, assigned_by, date_from, date_to, status
            FROM Assignments WHERE assignment_id=?
        """
        return self._query(sql, (assignment_id,), fetch_one=True)

    def user_can_access_course(self, user_id, course_id):
        assignment = self.get_active_assignment(user_id, course_id)
        return assignment is not None

    def get_courses_for_user(self, user_id):
        if self._table_exists('Assignments'):
            sql = """
                SELECT
                    C.course_id, C.title, C.description, C.storage, C.date,
                    A.assignment_id, A.date_from, A.date_to, A.status AS assignment_status,
                    UR.result, UR.date AS result_date
                FROM Assignments A
                JOIN Courses C ON A.course_id = C.course_id
                LEFT JOIN User_result UR ON UR.assignment_id = A.assignment_id
                WHERE A.user_id = ? AND A.status = 'active'
                ORDER BY C.title
            """
            rows = self._query(sql, (user_id,))
            if rows is None:
                return []

            result = []
            for row in rows:
                sections = self.get_assignment_sections_progress(row.assignment_id)
                payload = self._course_payload(
                    row,
                    assignment_id=row.assignment_id,
                    date_from=row.date_from,
                    date_to=row.date_to,
                    assignment_status=row.assignment_status,
                    sections_completed=len(sections)
                )
                result.append(payload)
            return result

        sql = """
            SELECT
                C.course_id, C.title, C.description, C.storage, C.date,
                UR.result, UR.date AS result_date
            FROM User_result UR
            JOIN Courses C ON UR.course_id = C.course_id
            WHERE UR.user_id = ?
            ORDER BY C.title
        """
        rows = self._query(sql, (user_id,))
        if rows is None:
            return []

        return [self._course_payload(row) for row in rows]

    def get_assignment_sections_progress(self, assignment_id):
        rows = self._query(
            "SELECT section_id, score, first_attempt_failed FROM Section_progress WHERE assignment_id=?",
            (assignment_id,)
        )
        if not rows:
            return []
        return [
            {
                "section_id": row.section_id,
                "score": float(row.score),
                "first_attempt_failed": bool(row.first_attempt_failed)
            }
            for row in rows
        ]

    def get_course_progress(self, user_id, course_id, assignment_id):
        assignment = self.get_assignment_by_id(assignment_id)
        if not assignment or assignment.user_id != user_id or assignment.course_id != course_id:
            return None
        if assignment.status != 'active':
            return None

        result_row = self._query(
            "SELECT result FROM User_result WHERE assignment_id=?",
            (assignment_id,),
            fetch_one=True
        )
        total = float(result_row.result) if result_row and result_row.result is not None else 0
        sections = self.get_assignment_sections_progress(assignment_id)
        return {
            "assignment_id": assignment_id,
            "status": assignment.status,
            "total_score": total,
            "passed": total >= PASS_THRESHOLD,
            "sections": sections
        }

    def _get_course_manifest(self, course_id):
        course = self.get_course_by_id(course_id)
        if not course:
            return None
        storage = resolve_course_storage(course.storage, course.course_id, course.title)
        return load_course_manifest(storage)

    def _count_completed_scorable_sections(self, assignment_id, manifest):
        if not manifest:
            return 0
        progress = self.get_assignment_sections_progress(assignment_id)
        completed_ids = {item['section_id'] for item in progress if item.get('score', 0) > 0}
        scorable_ids = {
            section['id'] for section in manifest.get('sections', [])
            if is_scorable_section(section)
        }
        return len(completed_ids & scorable_ids)

    def _clear_assignment_traversal(self, assignment_id):
        self._query(
            "DELETE FROM Section_progress WHERE assignment_id=?",
            (assignment_id,),
            commit=True
        )
        try:
            from scorm_runtime import delete_scorm_state
            delete_scorm_state(assignment_id)
        except OSError:
            pass

    def complete_section(self, user_id, course_id, assignment_id, section_id, is_practical, passed_first_try, section_weight):
        assignment = self.get_assignment_by_id(assignment_id)
        if not assignment or assignment.user_id != user_id or assignment.course_id != course_id:
            return None, 'Назначение не найдено'
        if assignment.status != 'active':
            return None, 'Курс недоступен. Обратитесь к эксперту для переназначения.'

        from course_progress import calculate_section_score

        manifest = self._get_course_manifest(course_id)
        section_meta = None
        if manifest:
            section_meta = next(
                (section for section in manifest.get('sections', []) if section.get('id') == section_id),
                None
            )
            if section_meta and not is_scorable_section(section_meta):
                existing = self._query(
                    "SELECT section_progress_id FROM Section_progress WHERE assignment_id=? AND section_id=?",
                    (assignment_id, section_id),
                    fetch_one=True
                )
                if not existing:
                    self._query(
                        """INSERT INTO Section_progress (assignment_id, section_id, score, first_attempt_failed)
                           VALUES (?, ?, 0, 0)""",
                        (assignment_id, section_id),
                        commit=True
                    )
                total = self._recalculate_assignment_score(assignment_id)
                return {
                    "section_id": section_id,
                    "section_score": 0,
                    "total_score": total,
                    "first_attempt_failed": False,
                    "passed": total >= PASS_THRESHOLD
                }, None
            if manifest.get('section_weight'):
                section_weight = float(manifest['section_weight'])

        new_score, new_first_failed = calculate_section_score(section_weight, is_practical, passed_first_try)

        existing = self._query(
            "SELECT section_progress_id, score, first_attempt_failed FROM Section_progress WHERE assignment_id=? AND section_id=?",
            (assignment_id, section_id),
            fetch_one=True
        )

        if existing:
            score, first_failed = merge_section_score(existing.score, new_score, section_weight)
            self._query(
                """UPDATE Section_progress SET score=?, first_attempt_failed=?, updated_at=GETDATE()
                   WHERE assignment_id=? AND section_id=?""",
                (score, first_failed, assignment_id, section_id),
                commit=True
            )
        else:
            score = new_score
            first_failed = new_first_failed
            self._query(
                """INSERT INTO Section_progress (assignment_id, section_id, score, first_attempt_failed)
                   VALUES (?, ?, ?, ?)""",
                (assignment_id, section_id, score, first_failed),
                commit=True
            )

        total = self._recalculate_assignment_score(assignment_id)

        return {
            "section_id": section_id,
            "section_score": score,
            "total_score": total,
            "first_attempt_failed": first_failed,
            "passed": total >= PASS_THRESHOLD
        }, None

    def finish_course(self, user_id, course_id, assignment_id, total_sections=0):
        assignment = self.get_assignment_by_id(assignment_id)
        if not assignment or assignment.user_id != user_id:
            return None, 'Назначение не найдено'
        if assignment.status != 'active':
            return None, 'Курс уже завершён'

        manifest = self._get_course_manifest(course_id)
        required_sections = manifest.get('scorable_count', total_sections) if manifest else total_sections
        completed_count = self._count_completed_scorable_sections(assignment_id, manifest)

        total = self._recalculate_assignment_score(assignment_id)
        from course_progress import assignment_status_from_score
        all_done = required_sections > 0 and completed_count >= required_sections
        new_status = assignment_status_from_score(total, all_done)

        if all_done:
            self._query(
                "UPDATE Assignments SET status=? WHERE assignment_id=?",
                (new_status, assignment_id),
                commit=True
            )
            self._clear_assignment_traversal(assignment_id)

        return {
            "total_score": total,
            "passed": total >= PASS_THRESHOLD,
            "assignment_status": new_status if all_done else 'active',
            "completed_sections": completed_count,
            "total_sections": required_sections
        }, None

    def _recalculate_assignment_score(self, assignment_id):
        row = self._query(
            "SELECT COALESCE(SUM(score), 0) AS total FROM Section_progress WHERE assignment_id=?",
            (assignment_id,),
            fetch_one=True
        )
        total = cap_course_score(float(row.total) if row else 0)

        existing = self._query(
            "SELECT User_result_id FROM User_result WHERE assignment_id=?",
            (assignment_id,),
            fetch_one=True
        )
        assignment = self.get_assignment_by_id(assignment_id)
        if existing:
            self._query(
                "UPDATE User_result SET result=?, date=CAST(GETDATE() AS date) WHERE assignment_id=?",
                (total, assignment_id),
                commit=True
            )
        else:
            self._query(
                """INSERT INTO User_result (result, user_id, course_id, assignment_id, date)
                   VALUES (?, ?, ?, ?, CAST(GETDATE() AS date))""",
                (total, assignment.user_id, assignment.course_id, assignment_id),
                commit=True
            )
        return total
