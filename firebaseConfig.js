// firebaseConfig.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
	apiKey: "AIzaSyCBH8AoZ9215Fg3rNiUy3_vomEUzUEJL7c",
	authDomain: "safeclickapp-1ec87.firebaseapp.com",
	projectId: "safeclickapp-1ec87",
	storageBucket: "safeclickapp-1ec87.firebasestorage.app",
	messagingSenderId: "765793802150",
	appId: "1:765793802150:web:b750c26d233adf38a52167"
};

// Inicializar Firebase
let app;
let db;
let auth;

try {
	app = initializeApp(firebaseConfig);
	db = getFirestore(app);
	auth = getAuth(app);
	console.log('✅ Firebase inicializado com sucesso!');
	console.log('📊 Projeto: safeclickapp-1ec87');
} catch (error) {
	console.error('❌ Erro ao inicializar Firebase:', error);
}

export { db, auth };
