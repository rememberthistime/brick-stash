import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Review from './components/Review';
import Snap from './components/Snap';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {{ '/snap': <Snap />, '/review': <Review /> }[location.pathname.replace(/\/$/, '')] ?? <App />}
  </StrictMode>,
);
