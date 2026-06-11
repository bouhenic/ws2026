// Page pédagogique : le pipeline CI/CD du projet, du push au déploiement.
// Contenu statique, fidèle à .github/workflows/deploy.yml.

const TRIGGER = {
    icon: '⚡',
    title: 'Déclencheur',
    description: 'Un « git push » sur la branche main déclenche automatiquement le workflow '
        + 'GitHub Actions. Il peut aussi être lancé à la main depuis GitHub (workflow_dispatch).',
    command: 'git push origin main',
};

const JOBS = [
    {
        icon: '✅',
        name: 'check',
        title: 'Vérifications',
        description: 'Garde-fou qualité : si une étape échoue, le pipeline s\'arrête et rien n\'est publié.',
        steps: [
            'Installation de Node.js 22 et des dépendances (npm ci)',
            'Vérification de la syntaxe des sources de l\'API (npm run check)',
            'Build du dashboard React avec Vite (npm run build)',
        ],
    },
    {
        icon: '📦',
        name: 'build-and-push',
        title: 'Construction des images Docker',
        description: 'Les deux images sont construites puis poussées sur le registre GHCR, '
            + 'taguées « latest » et avec le SHA du commit (traçabilité, retour arrière possible).',
        steps: [
            'Connexion à ghcr.io (GitHub Container Registry)',
            'Build de l\'image API (Node/Express)',
            'Build de l\'image nginx — le dashboard y est compilé par Vite (build multi-étapes)',
            'Push des images, avec cache de build partagé entre les exécutions',
        ],
    },
    {
        icon: '🚀',
        name: 'deploy',
        title: 'Déploiement sur la VM',
        description: 'La VM DigitalOcean récupère les nouvelles images et recrée les conteneurs '
            + 'mis à jour, sans toucher aux données InfluxDB.',
        steps: [
            'Copie de docker-compose.yml sur la VM (scp)',
            'Connexion SSH, puis docker login ghcr.io',
            'docker compose pull api nginx',
            'docker compose up -d (recréation des seuls conteneurs modifiés)',
            'Nettoyage des images obsolètes',
        ],
    },
];

const SECRETS = [
    { name: 'DO_HOST', role: 'adresse de la VM' },
    { name: 'DO_USER', role: 'utilisateur SSH' },
    { name: 'DO_SSH_KEY', role: 'clé privée SSH' },
    { name: 'GHCR_PAT', role: 'lecture du registre depuis la VM' },
];

export default function PipelinePage() {
    return (
        <div className="app">
            <header className="topbar">
                <div>
                    <h1>⚙️ Pipeline CI/CD</h1>
                    <p className="subtitle">Du push à la mise en production</p>
                </div>
                <a className="back-link" href="#/">← Retour au dashboard</a>
            </header>

            <main className="pipeline">
                <div className="card pipeline-card pipeline-trigger">
                    <div className="pipeline-card-header">
                        <span className="pipeline-icon">{TRIGGER.icon}</span>
                        <h2>{TRIGGER.title}</h2>
                    </div>
                    <p>{TRIGGER.description}</p>
                    <code className="pipeline-command">$ {TRIGGER.command}</code>
                </div>

                {JOBS.map((job, index) => (
                    <div key={job.name} className="pipeline-stage">
                        <div className="pipeline-arrow" aria-hidden="true">
                            ▼
                            {index > 0 && <span className="pipeline-needs">si le job précédent réussit</span>}
                        </div>
                        <div className="card pipeline-card">
                            <div className="pipeline-card-header">
                                <span className="pipeline-icon">{job.icon}</span>
                                <h2>{job.title}</h2>
                                <code className="pipeline-badge">{job.name}</code>
                            </div>
                            <p>{job.description}</p>
                            <ol className="pipeline-steps">
                                {job.steps.map((step) => <li key={step}>{step}</li>)}
                            </ol>
                        </div>
                    </div>
                ))}

                <div className="pipeline-stage">
                    <div className="pipeline-arrow" aria-hidden="true">▼</div>
                    <div className="card pipeline-card pipeline-prod">
                        <div className="pipeline-card-header">
                            <span className="pipeline-icon">🌍</span>
                            <h2>En production</h2>
                        </div>
                        <p>
                            La nouvelle version est en ligne sur{' '}
                            <a href="https://weatherstation.cielnewton.fr">weatherstation.cielnewton.fr</a>,
                            environ 2 minutes après le push. Aucune commande manuelle sur le serveur.
                        </p>
                    </div>
                </div>

                <div className="card pipeline-card">
                    <div className="pipeline-card-header">
                        <span className="pipeline-icon">🔐</span>
                        <h2>Secrets GitHub Actions</h2>
                    </div>
                    <p>
                        Les informations sensibles ne sont jamais dans le code : elles sont stockées
                        comme secrets chiffrés du dépôt et injectées au moment de l'exécution.
                    </p>
                    <ul className="pipeline-secrets">
                        {SECRETS.map((secret) => (
                            <li key={secret.name}>
                                <code>{secret.name}</code> — {secret.role}
                            </li>
                        ))}
                    </ul>
                </div>
            </main>

            <footer>
                <a href="#/">Dashboard</a>
                <span>·</span>
                <a href="https://github.com/bouhenic/ws2026" target="_blank" rel="noreferrer">
                    Code source sur GitHub
                </a>
            </footer>
        </div>
    );
}
