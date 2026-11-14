
# Solibra

**Preserving memories, connecting generations.**

Solibra is a collaborative digital library designed to help families, friends, and communities preserve and share the stories that define them. From cherished photographs and traditional recipes to personal stories and cultural traditions, Solibra provides a centralized space to document memories and pass them on to future generations.

Built for **SanD Hacks 2026**, Solibra aims to make cultural preservation more accessible, personal, and collaborative.

Demo: 

## Features

Solibra is being developed around the following features:

- **Digital Memory Library:** Store and organize photographs, recipes, stories, and traditions in one place.
- **Collaborative Collections:** Allow family members and friends to contribute to shared libraries.
- **Cultural Preservation:** Document meaningful traditions, customs, and personal experiences for future generations.
- **User Authentication:** Secure account creation and login to manage personal and shared content.
- **Personalized Dashboard:** Access and manage saved memories and collections through an intuitive interface.
- **Memory Organization:** Categorize content to make memories easier to browse and rediscover.

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org/)
- **Language:** TypeScript
- **Frontend:** React, Tailwind CSS
- **Database:** [PostgreSQL](https://www.postgresql.org/)
- **ORM:** [Drizzle](https://orm.drizzle.team/)
- **UI Components:** [shadcn/ui](https://ui.shadcn.com/)
- **Authentication:** JWT-based authentication

## Getting Started

### Prerequisites

Make sure you have the following installed:

- Node.js
- pnpm
- Git
- PostgreSQL database access

### Installation

Clone the repository:

```bash
git clone https://github.com/anewshoe/Solibra.git
cd Solibra
```

Install dependencies:

```bash
pnpm install
```

### Environment Setup

Run the included database setup script:

```bash
pnpm db:setup
```

This creates a `.env` file containing the environment variables required by the starter application.

Configure the required environment variables, including your PostgreSQL connection string and authentication secret.

**Note:** The original SaaS starter also includes Stripe environment variables. These may be required by existing starter code until unused payment functionality is removed.

### Database Setup

Run database migrations:

```bash
pnpm db:migrate
```

Optionally, seed the database with development data:

```bash
pnpm db:seed
```

### Running Locally

Start the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

## Development

Solibra is an ongoing project developed as part of SanD Hacks 2026.

To contribute changes:

1. Create a new branch for your feature.
2. Implement and test your changes locally.
3. Commit your changes with a descriptive message.
4. Push your branch to GitHub.
5. Open a pull request for review.

## Our Mission

Memories are more than photographs or written records. They represent the people, cultures, and experiences that shape our identities.

Unfortunately, many personal stories, family recipes, and cultural traditions are lost over time when they are not documented or shared.

**Solibra aims to bridge this gap by making memory preservation a shared experience.** By giving communities a space to collaboratively document their histories, we hope to help meaningful stories survive across generations.

## Hackathon

Developed for **SanD Hacks 2026**.

## Repository

[github.com/anewshoe/Solibra](https://github.com/anewshoe/Solibra)
