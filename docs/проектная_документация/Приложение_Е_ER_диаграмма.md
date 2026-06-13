# Приложение Е. ER-диаграмма

**Проект:** Адаптационный курс для сотрудников ритуальной компании  
**Версия:** 1.0  
**Дата:** июнь 2026  
**СУБД:** Microsoft SQL Server, база `LearningPlatformDB`

---

## Рисунок 4. ER-диаграмма

```mermaid
erDiagram
    Users ||--o{ UserRoles : "имеет"
    Roles ||--o{ UserRoles : "назначена"
    Position ||--o{ Users : "должность"
    Users ||--o{ Assignments : "назначен"
    Users ||--o{ Assignments : "назначил"
    Courses ||--o{ Assignments : "включает"
    Assignments ||--o{ Section_progress : "прогресс"
    Users ||--o{ User_result : "результат"
    Courses ||--o{ User_result : "по курсу"
    Assignments ||--o| User_result : "по назначению"
    Users ||--o{ Courses : "автор"

    Users {
        int user_id PK
        nvarchar name
        nvarchar surname
        nvarchar patronymic
        int position_id FK
        nvarchar email UK
        nvarchar password_hash
        nvarchar photo
        date birthday
        nvarchar phone
        nvarchar status
    }

    Roles {
        int role_id PK
        nvarchar role_name UK
    }

    UserRoles {
        int UserRoles_id PK
        int user_id FK
        int role_id FK
    }

    Position {
        int Position_id PK
        nvarchar name
    }

    Courses {
        int course_id PK
        nvarchar title
        nvarchar description
        int author_id FK
        datetime2 date
        nvarchar storage
    }

    Assignments {
        int assignment_id PK
        int user_id FK
        int course_id FK
        int assigned_by FK
        date date_from
        date date_to
        nvarchar status
        datetime2 assigned_at
    }

    Section_progress {
        int section_progress_id PK
        int assignment_id FK
        nvarchar section_id
        float score
        bit first_attempt_failed
        datetime2 updated_at
    }

    User_result {
        int User_result_id PK
        float result
        int user_id FK
        int course_id FK
        date date
        int assignment_id FK
    }
```

---

## Описание связей

| Связь | Тип | Описание |
|-------|-----|----------|
| Users — UserRoles — Roles | M:N | Пользователь может иметь одну роль (через связующую таблицу) |
| Position — Users | 1:N | Справочник должностей |
| Users — Assignments (user_id) | 1:N | Назначения, полученные сотрудником |
| Users — Assignments (assigned_by) | 1:N | Назначения, созданные экспертом |
| Courses — Assignments | 1:N | Курс может быть назначен многим сотрудникам |
| Assignments — Section_progress | 1:N | Прогресс по разделам в рамках назначения |
| Users — User_result | 1:N | Итоговые баллы пользователя |
| Courses — User_result | 1:N | Результаты по курсу |
| Assignments — User_result | 1:1 | Результат привязан к конкретному назначению |
| Users — Courses (author_id) | 1:N | Автор (создатель) записи курса в каталоге |

---

## Примечание о структуре курса

Разделы, квизы и интерактивы **не хранятся в отдельных таблицах БД**. Структура нативного курса описана в файле `course.json` в папке `backend/courses/<storage>/`. SCORM-курсы используют `imsmanifest.xml`.

Концептуальные сущности «Модуль» и «Квиз» из учебного шаблона отображаются на:

- **Модуль** → `section_id` в `Section_progress` и записи manifest;
- **Квиз** → HTML-разметка с `data-quiz` в файлах курса.

---

## Примечание для переноса в Word

Экспортируйте диаграмму как «Рисунок 4. ER-диаграмма» для включения в пояснительную записку.
