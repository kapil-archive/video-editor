import { Link } from 'react-router-dom'
import heroImage from '../assets/hero.png'

function Home() {
    return (
        <main className='home-page'>
            <Link className='primary-link' to='/editor'>
                Open image editor
            </Link>
        </main>
    )
}

export default Home
