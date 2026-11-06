import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { borrowerLevel, initials, ownerLevel } from '../lib/util'
import { Icon, Page, Avatar } from '../components/ui'

function Action({ to, icon, title, text }: { to: string; icon: string; title: string; text: string }) {
  return <Link to={to} className="card stack s6" style={{ color: 'inherit' }}>
    <span className="stat-icon"><Icon name={icon} size={20} /></span>
    <span className="stack s2"><span className="bold">{title}</span><span className="small soft">{text}</span></span>
  </Link>
}

function Row({ to, icon, title, text }: { to: string; icon: string; title: string; text: string }) {
  return <Link to={to} className="card row" style={{ padding: '12px 14px', color: 'inherit' }}>
    <span className="stat-icon"><Icon name={icon} size={18} /></span>
    <span className="stack s2 grow"><span className="bold">{title}</span><span className="small soft">{text}</span></span>
    <Icon name="right" size={18} />
  </Link>
}

export default function Espace() {
  const { user, profile, signOut } = useAuth()
  const nav = useNavigate()
  const level = ownerLevel(profile)
  const borrower = borrowerLevel(profile?.score ?? 400)
  const verified = profile?.identity_status === 'verified'
  const identity = verified ? 'Identité vérifiée' : profile?.identity_status === 'pending' ? 'Vérification en cours' : profile?.identity_status === 'rejected' ? 'Documents à corriger' : 'Identité à vérifier'

  return <Page>
    <div className="stack s2">
      <div className="small muted">Bonjour {profile?.first_name || ''}</div>
      <h1 className="display h1">Mon espace</h1>
    </div>

    <div className="card dark stack s8">
      <div className="row">
        <Avatar url={profile?.avatar_url} name={profile?.first_name} size={56} />
        <div className="stack s2 grow">
          <div className="bold" style={{ fontSize: 18 }}>{profile?.first_name} {profile?.last_name}</div>
          <div className="small muted">{user.email}</div>
        </div>
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className={'pill' + (verified ? '' : ' warn')}>{identity}</span>
        <span className="pill gold">Score {profile?.score ?? 400}</span>
        <span className="pill dark">Loueur {level.name.toLowerCase()}</span>
        <span className="pill dark">Emprunteur {borrower.name.toLowerCase()}</span>
      </div>
    </div>

    {!verified && <div className="notice">
      {profile?.identity_status === 'pending'
        ? 'Votre dossier est en cours d’examen. Vous pourrez louer et publier dès la validation.'
        : 'Vérifiez votre identité pour pouvoir demander une location ou publier du matériel. '}
      {profile?.identity_status !== 'pending' && <Link to="/profil#identite" className="bold green">Vérifier maintenant</Link>}
    </div>}

    <div className="grid2">
      <Action to="/reservations" icon="cal" title="Mes réservations" text="Demandes, codes de remise et historique." />
      <Action to="/revenus" icon="card" title="Suivi des locations" text="Demandes reçues pour votre matériel." />
      <Action to="/mes-annonces" icon="box" title="Mes annonces" text="Gérer le matériel que vous proposez." />
      <Action to="/publier" icon="plus" title="Publier un matériel" text="Ajouter une nouvelle annonce." />
    </div>

    <div className="stack s8">
      <h2 className="h3">Mon compte</h2>
      <Row to="/profil" icon="user" title="Mon profil" text="Informations personnelles et vérification d’identité." />
      <Row to="/score" icon="spark" title="Score de confiance" text="Points, avis reçus et avantages." />
      {profile?.is_admin && <Row to="/admin" icon="shield" title="Administration" text="Utilisateurs, annonces, réservations et litiges." />}
    </div>

    <div className="card stack">
      <h2 className="h3">Explorer ABALMA</h2>
      <p className="small soft">Retrouvez la page de présentation et les annonces disponibles près de chez vous.</p>
      <Link to="/accueil#annonces" className="btn">Explorer les annonces</Link>
    </div>

    <div className="grid2">
      <Link to="/accueil" className="btn ghost">Revenir à l’accueil</Link>
      <button className="btn ghost" onClick={async () => { await signOut(); nav('/accueil', { replace: true }) }}>Se déconnecter</button>
    </div>
  </Page>
}

