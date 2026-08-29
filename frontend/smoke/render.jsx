// Smoke test: render every view to a string and report anything that throws.
import { renderToString } from 'react-dom/server';
import App from '../src/App.jsx';
import { DataProvider } from '../src/state/DataContext.jsx';
import { UiProvider } from '../src/state/UiContext.jsx';

const html = renderToString(<App />);
console.log('board OK, length', html.length);
console.log('has brand:', html.includes('บ้านสวนพลู'));
console.log('has room 101:', html.includes('101'));
console.log('has legend:', html.includes('มีกำหนดย้ายออก'));
