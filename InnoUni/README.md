# Gather Edu

A comprehensive online learning platform built with modern web technologies, featuring teacher-led courses, student collaboration teams, and interactive learning management.

## Status (first version)

Gather Edu is a platform for students. The first version focuses on **teams and competitions**.
Teacher accounts, study groups, the public course catalog, tasks, results and pricing are switched off for now
(feature flags in `secondary-pages/dashboard/dashboard.html` and `FEATURE_*` variables on the server).

## Features

- **Teams (Jamoalar)**: open or join a team, chat, resources, meetups with reminders, team profile and activity
- **Battles**: teams challenge each other (quiz or project), automatic scoring, rating and leagues, trophies
- **Seasonal tournaments**: groups (round robin), then playoffs and a champion; the admin runs each stage
- **Players**: personal stats, badges and a leaderboard
- **Fair play**: rules page, result objections within 48 hours, admin review
- **Hall of Fame**: tournament champions
- **AI tools**: AI courses and study materials made by the student
- **Admin panel**: users, teams, battles, tournaments (with own questions), objections

## Technology Stack

- **Frontend**: static HTML, CSS and plain JavaScript (no framework). User text is always set with `textContent`.
- **Backend**: Node.js, Express, JWT, bcrypt, express-rate-limit, helmet
- **Database**: MySQL-compatible (TiDB). Migrations in `backend/migrations` run when the server starts.
- **Tests**: Jest, supertest, JSDOM (`npm test` in `backend`)

## 📁 Project Structure

```
Gather Edu/
├── index.html                 # Main landing page
├── secondary-pages/            # Application pages
│   ├── login/                # Authentication pages
│   ├── dashboard/            # Main application
│   │   ├── dashboard.html     # Dashboard layout
│   │   └── pages/           # Individual pages
│   │       ├── main.dashboard.html
│   │       ├── profile.html
│   │       ├── vazifalar.html
│   │       ├── groups.html
│   │       └── jamoalar.html
│   └── register/
├── backend/                   # Backend API server
│   ├── server.js            # Main server file
│   ├── package.json         # Dependencies and scripts
│   ├── .env.example        # Environment variables template
│   ├── database/            # Database setup
│   │   └── init.sql      # Database schema
│   └── api/               # API route handlers
│       ├── auth.js         # Authentication routes
│       ├── dashboard.js    # Dashboard API
│       └── ...             # Other API modules
├── frontend/                # Frontend assets
│   ├── js/                # JavaScript modules
│   │   ├── api.js         # API client
│   │   ├── dashboard.js   # Dashboard functionality
│   │   └── ...           # Other modules
│   ├── css/               # Stylesheets
│   └── imgs/              # Images and assets
└── style/                  # Global styles
    └── style.css           # Main stylesheet
```

## 🚀 Getting Started

### Prerequisites
- Node.js 16.0 or higher
- MySQL 8.0 or higher
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd "Gather Edu"
   ```

2. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Setup environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials and email settings
   ```

4. **Setup email for contact form**
   - Gmail uchun App Password yarating:
     1. Google Account -> Security -> 2-Step Verification
     2. App passwords -> Create new app password
     3. Passwordni .env faylga qo'shing
   ```env
   EMAIL_USER=your-email@example.com
   EMAIL_PASS=your-gmail-app-password
   ```

5. **Setup database**
   ```bash
   mysql -u root -p < database/init.sql
   ```

6. **Start the backend server**
   ```bash
   npm run dev
   # or
   npm start
   ```

7. **Open the frontend**
   Open `index.html` in your web browser

### Environment Variables

Create a `.env` file in the backend directory:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=oqiv_platform

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-here

# Server Configuration
PORT=3000
NODE_ENV=development
```

## 📚 API Documentation

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile

### Dashboard
- `GET /api/dashboard/stats/:userId` - Get dashboard statistics
- `GET /api/dashboard/activity/:userId` - Get recent activity
- `GET /api/dashboard/recommendations/:userId` - Get recommendations

### Courses
- `GET /api/courses` - Get all courses
- `POST /api/courses` - Create new course (teacher)
- `POST /api/courses/:id/enroll` - Enroll in course

### Groups
- `GET /api/groups` - Get all groups
- `POST /api/groups` - Create new group
- `POST /api/groups/:id/join` - Join group

### Tasks
- `GET /api/tasks/:userId` - Get user tasks
- `POST /api/tasks` - Create new task
- `PUT /api/tasks/:id` - Update task status

### Submissions and grading
A task is assigned to one student (`tasks.assigned_to`). The student submits an answer, the teacher of the task's course grades it.
- `POST /api/student/tasks/:taskId/submit` - Submit or re-submit an answer, body `{ "content": "..." }` (re-submitting is blocked after grading)
- `GET /api/student/tasks/:taskId/submission` - Own submission with grade and feedback
- `GET /api/teacher/tasks/:taskId/submissions` - Submissions of one of your tasks
- `POST /api/teacher/tasks/:taskId/grade` - Grade the submission, body `{ "grade": 0-100, "feedback": "optional" }`

## 🎨 UI Components

### Design System
- **Color Scheme**: Dark theme with blue gradient accents
- **Typography**: Clean, readable fonts with proper hierarchy
- **Spacing**: Consistent spacing using Bootstrap grid
- **Animations**: Smooth transitions and micro-interactions
- **Responsive**: Mobile-first responsive design

### Key Components
- **Glassmorphism Cards**: Modern frosted glass effect
- **Progress Bars**: Visual progress indicators
- **Status Badges**: Color-coded status indicators
- **Avatar System**: User and group avatars
- **Navigation**: Intuitive sidebar navigation

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt for secure password storage
- **Input Validation**: Server-side input sanitization
- **CORS Configuration**: Proper cross-origin resource sharing
- **SQL Injection Prevention**: Parameterized queries

## 🌐 Deployment

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

### Environment Setup
- **Development**: Local development with hot reload
- **Staging**: Pre-production testing environment
- **Production**: Optimized build with security headers

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📞 Support

For support and questions:
- Email: support@oqiv.uz
- Documentation: [Wiki/Documentation](link)
- Issues: [GitHub Issues](link)

## 🙏 Acknowledgments

- Bootstrap Team for the UI framework
- Font Awesome for the icon library
- MySQL for the database system
- Node.js community for the runtime environment

---

**Gather Edu** - O'zbek tilidagi zamonaviy ta'lim platformasi
*Modern learning platform in Uzbek language*
