import './style.css';
import { BackgroundScene } from './three/BackgroundScene.js';

const canvas = document.querySelector('#webgl');
const heroSection = document.querySelector('#home');

if (!canvas || !heroSection) {
  throw new Error('Landing page canvas or section was not found.');
}

const backgroundScene = new BackgroundScene(canvas, heroSection);

backgroundScene.start();

window.addEventListener('beforeunload', () => {
  backgroundScene.dispose();
});