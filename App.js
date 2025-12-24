import React, { useState, useEffect, useRef } from 'react';
import {
	StyleSheet,
	Text,
	View,
	TouchableOpacity,
	TextInput,
	Alert,
	ScrollView,
	ActivityIndicator,
	Platform,
	Linking,
	Image
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import openMap from 'react-native-open-maps';

// FIREBASE IMPORTS
import { auth, db, storage } from './firebaseConfig';
import {
	createUserWithEmailAndPassword,
	signInWithEmailAndPassword,
	signOut,
	onAuthStateChanged,
	sendEmailVerification,
	sendPasswordResetEmail
} from 'firebase/auth';
import {
	collection,
	addDoc,
	getDocs,
	query,
	where,
	doc,
	setDoc,
	getDoc,
	updateDoc,
	onSnapshot,
	serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function App() {
	const [screen, setScreen] = useState('login');
	const [userType, setUserType] = useState('');
	const [loading, setLoading] = useState(false);
	const [firebaseUser, setFirebaseUser] = useState(null);
	const [userData, setUserData] = useState(null);

	// Estados para localização e ajuda
	const [localizacaoAtual, setLocalizacaoAtual] = useState(null);
	const [pedidosAtivos, setPedidosAtivos] = useState([]);
	const [socorristaEmMissao, setSocorristaEmMissao] = useState(null);

	// Dados do formulário
	const [formData, setFormData] = useState({
		nome: '',
		email: '',
		password: '',
		dataNascimento: '',
		certificacao: '',
		morada: '',
		cidade: '',
		codigoPostal: '',
	});

	// ESTADOS PARA DOCUMENTO
	const [nomeDocumento, setNomeDocumento] = useState('');
	const certidaoRef = useRef(null);
	const documentoTemporario = useRef(null);

	// ESTADOS PARA DATEPICKER
	const [showDatePicker, setShowDatePicker] = useState(false);
	const [selectedDate, setSelectedDate] = useState(new Date(1990, 0, 1));

	// ESTADOS PARA FOTO DE PERFIL
	const [fotoPerfil, setFotoPerfil] = useState(null);
	const [fotoUri, setFotoUri] = useState(null);
	const [fotoCarregando, setFotoCarregando] = useState(false);

	// NOVOS ESTADOS PARA CONTAGEM REGRESSIVA
	const [pedidoContagem, setPedidoContagem] = useState(false);
	const [tempoRestante, setTempoRestante] = useState(3);

	// ================== FUNÇÕES AUXILIARES ==================
	const carregarDadosUsuario = async () => {
		if (!firebaseUser) return;

		try {
			const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
			if (userDoc.exists()) {
				const data = userDoc.data();
				setUserData(data);

				// Atualizar fotoUri com a nova URL
				if (data.fotoPerfilUrl) {
					setFotoUri(data.fotoPerfilUrl);
				}
			}
		} catch (error) {
			console.error('Erro ao recarregar dados:', error);
		}
	};

	// Função para formatar o tempo total
	const formatarTempoTotal = (minutosTotal) => {
		if (!minutosTotal) return '0 min';

		if (minutosTotal < 60) {
			return `${minutosTotal} min`;
		} else {
			const horas = Math.floor(minutosTotal / 60);
			const minutos = minutosTotal % 60;

			if (minutos === 0) {
				return `${horas}h`;
			} else {
				return `${horas}h ${minutos}min`;
			}
		}
	};

	// Função para formatar data
	const formatarData = (timestamp) => {
		if (!timestamp) return '---';

		try {
			let data;

			if (typeof timestamp.toDate === 'function') {
				data = timestamp.toDate();
			} else if (timestamp.seconds) {
				data = new Date(timestamp.seconds * 1000);
			} else {
				return '---';
			}

			return data.toLocaleDateString('pt-PT', {
				day: '2-digit',
				month: '2-digit',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch (error) {
			console.error('Erro ao formatar data:', error);
			return '---';
		}
	};

	// Função para calcular tempo de resgate
	const calcularTempoResgate = () => {
		if (!socorristaEmMissao?.aceiteEm) return null;

		try {
			let aceiteTimestamp;

			if (socorristaEmMissao.aceiteEm && typeof socorristaEmMissao.aceiteEm.toDate === 'function') {
				aceiteTimestamp = socorristaEmMissao.aceiteEm.toDate();
			} else if (socorristaEmMissao.aceiteEm && socorristaEmMissao.aceiteEm.seconds) {
				aceiteTimestamp = new Date(socorristaEmMissao.aceiteEm.seconds * 1000);
			} else if (socorristaEmMissao.aceiteEm instanceof Date) {
				aceiteTimestamp = socorristaEmMissao.aceiteEm;
			} else {
				console.log('Formato de timestamp não reconhecido:', socorristaEmMissao.aceiteEm);
				return null;
			}

			const agora = new Date();
			const diferencaMs = agora - aceiteTimestamp;
			const totalMinutos = Math.floor(diferencaMs / 60000);

			// Retornar em formato mais amigável para cálculo
			if (totalMinutos < 1) {
				return '1 min'; // Mínimo 1 minuto
			} else if (totalMinutos < 60) {
				return `${totalMinutos} min`;
			} else {
				const horas = Math.floor(totalMinutos / 60);
				const minutosRestantes = totalMinutos % 60;

				if (minutosRestantes === 0) {
					return `${horas}h`;
				} else {
					return `${horas}h ${minutosRestantes}min`;
				}
			}

		} catch (error) {
			console.error('❌ Erro ao calcular tempo de resgate:', error);
			return null;
		}
	};

	// ================== VERIFICAR USUÁRIO LOGADO ==================
	useEffect(() => {
		const unsubscribe = onAuthStateChanged(auth, async (user) => {
			if (user) {
				console.log('✅ Usuário logado no Firebase:', user.email);
				setFirebaseUser(user);

				try {
					const userDoc = await getDoc(doc(db, 'users', user.uid));
					if (userDoc.exists()) {
						const data = userDoc.data();
						setUserData(data);
						setUserType(data.tipo);

						setFormData(prev => ({
							...prev,
							nome: data.nome || '',
							email: user.email || '',
							morada: data.morada || '',
							cidade: data.cidade || '',
							codigoPostal: data.codigoPostal || '',
							dataNascimento: data.dataNascimento || '',
							certificacao: data.certificacao || '',
						}));

						if (data.documentoCertidao) {
							setNomeDocumento(data.documentoCertidao.nome);
						}

						// Carregar foto de perfil se existir
						if (data.fotoPerfilUrl) {
							setFotoUri(data.fotoPerfilUrl);
						}

						setScreen('home');
					}
				} catch (error) {
					console.error('❌ Erro ao buscar dados do usuário:', error);
				}
			} else {
				console.log('❌ Nenhum usuário logado');
				setFirebaseUser(null);
				setUserData(null);
				setFotoUri(null);
			}
		});

		return () => unsubscribe();
	}, []);

	// ================== CARREGAR FOTO AO ABRIR PERFIL ==================
	useEffect(() => {
		// Carregar foto atual do usuário ao abrir o perfil
		if (screen === 'perfil' && userData?.fotoPerfilUrl) {
			setFotoUri(userData.fotoPerfilUrl);
		}
	}, [screen, userData?.fotoPerfilUrl]);

	// ================== LIMPAR FOTO TEMPORÁRIA ==================
	useEffect(() => {
		return () => {
			// Limpar foto temporária ao sair do perfil
			if (screen !== 'perfil') {
				setFotoPerfil(null);
			}
		};
	}, [screen]);

	// ================== CARREGAR PEDIDOS DO FIREBASE ==================
	useEffect(() => {
		if (userType === 'com') {
			const pedidosRef = collection(db, 'pedidos');
			const q = query(pedidosRef, where('status', '==', 'pendente'));

			const unsubscribe = onSnapshot(q, (snapshot) => {
				const pedidos = [];
				snapshot.forEach((doc) => {
					pedidos.push({ id: doc.id, ...doc.data() });
				});
				setPedidosAtivos(pedidos);
				console.log(`📋 ${pedidos.length} pedidos ativos carregados`);
			});

			return () => unsubscribe();
		}
	}, [userType]);

	// ================== CONTAGEM REGRESSIVA PARA PEDIDO DE AJUDA ==================
	useEffect(() => {
		let intervalo;

		if (pedidoContagem && tempoRestante > 0) {
			intervalo = setInterval(() => {
				setTempoRestante((prev) => {
					if (prev <= 1) {
						// Quando chegar a 0, envia o pedido
						clearInterval(intervalo);
						setTimeout(() => {
							enviarPedidoAjuda();
							setPedidoContagem(false);
							setTempoRestante(3);
						}, 100);
						return 0;
					}
					return prev - 1;
				});
			}, 1000);
		}

		return () => {
			if (intervalo) clearInterval(intervalo);
		};
	}, [pedidoContagem, tempoRestante]);

	// ================== LOCALIZAÇÃO ==================
	useEffect(() => {
		(async () => {
			if (screen === 'home' || screen === 'mapaAjuda') {
				try {
					const { status } = await Location.requestForegroundPermissionsAsync();
					if (status !== 'granted') {
						Alert.alert('Permissão necessária', 'Ative a localização nas definições');
						return;
					}

					const location = await Location.getCurrentPositionAsync({});
					const novaLocalizacao = {
						latitude: location.coords.latitude,
						longitude: location.coords.longitude,
						latitudeDelta: 0.01,
						longitudeDelta: 0.01,
					};

					setLocalizacaoAtual(novaLocalizacao);

					if (firebaseUser) {
						await updateDoc(doc(db, 'users', firebaseUser.uid), {
							ultimaLocalizacao: {
								latitude: location.coords.latitude,
								longitude: location.coords.longitude,
								timestamp: serverTimestamp()
							}
						});
					}
				} catch (error) {
					console.error('❌ Erro na localização:', error);
				}
			}
		})();
	}, [screen, firebaseUser]);

	// ================== FUNÇÕES DE FOTO DE PERFIL ==================
	const tirarFoto = async () => {
		try {
			const { status } = await ImagePicker.requestCameraPermissionsAsync();
			if (status !== 'granted') {
				Alert.alert('Permissão necessária', 'Precisa de permitir acesso à câmara');
				return;
			}

			const result = await ImagePicker.launchCameraAsync({
				mediaTypes: ImagePicker.MediaTypeOptions.Images,
				allowsEditing: true,
				aspect: [1, 1],
				quality: 0.8, // Aumentar qualidade
			});

			if (!result.canceled && result.assets[0]) {
				const novaFoto = result.assets[0];
				setFotoPerfil(novaFoto); // Armazenar como nova foto
				setFotoUri(novaFoto.uri); // Mostrar preview
				Alert.alert('Foto tirada', 'Clique em "Atualizar Foto" para guardar');
			}
		} catch (error) {
			console.error('Erro ao tirar foto:', error);
			Alert.alert('Erro', 'Não foi possível tirar a foto');
		}
	};

	const escolherFotoGaleria = async () => {
		try {
			const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
			if (status !== 'granted') {
				Alert.alert('Permissão necessária', 'Precisa de permitir acesso à galeria');
				return;
			}

			const result = await ImagePicker.launchImageLibraryAsync({
				mediaTypes: ImagePicker.MediaTypeOptions.Images,
				allowsEditing: true,
				aspect: [1, 1],
				quality: 0.8,
			});

			if (!result.canceled && result.assets[0]) {
				const novaFoto = result.assets[0];
				setFotoPerfil(novaFoto); // Armazenar como nova foto
				setFotoUri(novaFoto.uri); // Mostrar preview
				Alert.alert('Foto selecionada', 'Clique em "Atualizar Foto" para guardar');
			}
		} catch (error) {
			console.error('Erro ao escolher foto:', error);
			Alert.alert('Erro', 'Não foi possível escolher a foto');
		}
	};

	const removerFoto = () => {
		Alert.alert(
			'Remover Foto',
			'Tem certeza que deseja remover a foto de perfil?',
			[
				{ text: 'Cancelar', style: 'cancel' },
				{
					text: 'Remover',
					style: 'destructive',
					onPress: () => {
						setFotoPerfil(null);
						setFotoUri(null);
					}
				}
			]
		);
	};

	const uploadFotoPerfil = async (userId, fotoParaUpload = null) => {
		const foto = fotoParaUpload || fotoPerfil;

		if (!foto) {
			console.log('❌ Nenhuma foto para upload');
			Alert.alert('Erro', 'Nenhuma foto selecionada');
			return null;
		}

		try {
			console.log('📤 Iniciando upload da foto:', foto.uri);

			// Verificar se a URI é válida
			if (!foto.uri || !foto.uri.startsWith('file://') && !foto.uri.startsWith('http')) {
				throw new Error('URI da foto inválida');
			}

			// Converter URI para blob
			const response = await fetch(foto.uri);

			if (!response.ok) {
				throw new Error(`Falha ao buscar imagem: ${response.status}`);
			}

			const blob = await response.blob();

			if (blob.size === 0) {
				throw new Error('A imagem está vazia ou corrompida');
			}

			// Criar referência no Storage
			const filename = `profile_${Date.now()}.jpg`;
			const storageRef = ref(storage, `profile-photos/${userId}/${filename}`);

			// Fazer upload
			await uploadBytes(storageRef, blob);

			// Obter URL de download
			const downloadURL = await getDownloadURL(storageRef);
			console.log('✅ Upload concluído, URL:', downloadURL);

			return downloadURL;
		} catch (error) {
			console.error('❌ Erro no upload:', error);
			Alert.alert('Erro de Upload', error.message || 'Erro desconhecido');
			return null;
		}
	};

	const atualizarFotoPerfil = async () => {
		console.log('🔄 Iniciando atualização de foto...');
		console.log('fotoUri atual:', fotoUri);
		console.log('fotoPerfil (temporária):', fotoPerfil);

		if (!firebaseUser) {
			Alert.alert('Erro', 'Usuário não autenticado');
			return;
		}

		// VERIFICAR SE HÁ ALTERAÇÃO
		const fotoJaExiste = userData?.fotoPerfilUrl;
		const fotoAtualExibida = fotoUri || fotoJaExiste;

		// Se não há nova foto selecionada E a foto atual é a mesma do banco
		if (!fotoPerfil && fotoAtualExibida === fotoJaExiste) {
			Alert.alert('Aviso', 'Selecione uma nova foto primeiro');
			return;
		}

		setFotoCarregando(true);
		try {
			// Se há fotoPerfil (nova), fazer upload
			let novaFotoUrl = fotoPerfil ? await uploadFotoPerfil(firebaseUser.uid, fotoPerfil) : fotoAtualExibida;

			if (!novaFotoUrl) {
				Alert.alert('Erro', 'Não foi possível obter URL da foto');
				return;
			}

			// Atualizar no Firestore
			await updateDoc(doc(db, 'users', firebaseUser.uid), {
				fotoPerfilUrl: novaFotoUrl,
				fotoAtualizadaEm: serverTimestamp()
			});

			// Recarregar dados
			await carregarDadosUsuario();
			setFotoPerfil(null);

			Alert.alert('✅ Sucesso', 'Foto atualizada com sucesso!');

		} catch (error) {
			console.error('❌ Erro:', error);
			Alert.alert('Erro', 'Não foi possível atualizar a foto');
		} finally {
			setFotoCarregando(false);
		}
	};

	// ================== FUNÇÕES DE DOCUMENTO ==================
	const selecionarCertidao = async () => {
		try {
			const result = await DocumentPicker.getDocumentAsync({});

			if (!result.canceled && result.assets && result.assets.length > 0) {
				const asset = result.assets[0];
				setNomeDocumento(asset.name);
				documentoTemporario.current = asset;
				certidaoRef.current = asset;

				Alert.alert('✅ DOCUMENTO SELECIONADO!', `Ficheiro: ${asset.name}`);
			}
		} catch (error) {
			console.error('❌ ERRO:', error);
			Alert.alert('Erro', 'Não foi possível selecionar o ficheiro');
		}
	};

	// ================== FUNÇÕES DO DATEPICKER (MODIFICADAS) ==================
	const onChangeDate = (event, selectedDate) => {
		const currentDate = selectedDate || selectedDate;
		setSelectedDate(currentDate);

		if (event.type === 'set') {
			const day = currentDate.getDate().toString().padStart(2, '0');
			const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
			const year = currentDate.getFullYear();
			const formattedDate = `${day}/${month}/${year}`;

			setFormData({ ...formData, dataNascimento: formattedDate });

			// No Android, esconder o picker automaticamente
			if (Platform.OS === 'android') {
				setShowDatePicker(false);
			}
		} else if (event.type === 'dismissed') {
			// No iOS, quando o picker é fechado
			setShowDatePicker(false);
		}
	};

	const showDatePickerModal = () => {
		setShowDatePicker(true);
	};

	const cancelDatePicker = () => {
		setShowDatePicker(false);
	};

	// ================== VALIDAÇÃO COM API CRUZ VERMELHA ==================
	const validarComCruzVermelha = async (numeroCertificacao) => {
		setLoading(true);
		try {
			await new Promise(resolve => setTimeout(resolve, 1500));
			setLoading(false);
			return {
				valido: true,
				mensagem: '✅ Certificado válido da Cruz Vermelha',
			};
		} catch (error) {
			setLoading(false);
			return {
				valido: false,
				mensagem: 'Erro de conexão com a Cruz Vermelha',
			};
		}
	};

	// ================== FUNÇÕES PRINCIPAIS ==================
	const handleLogin = async () => {
		if (!formData.email || !formData.password) {
			Alert.alert('Erro', 'Preencha email e password');
			return;
		}

		const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!regexEmail.test(formData.email)) {
			Alert.alert('Erro', 'Formato de email inválido. Use: exemplo@dominio.com');
			return;
		}

		setLoading(true);
		try {
			const userCredential = await signInWithEmailAndPassword(
				auth,
				formData.email,
				formData.password
			);

			const user = userCredential.user;

			if (!user.emailVerified) {
				Alert.alert(
					'⚠️ Email Não Verificado',
					'Por favor, verifique seu email antes de continuar.\n\n' +
					'Enviamos um link de verificação para:\n' + user.email,
					[
						{ text: 'Reenviar Verificação', onPress: () => reenviarEmailVerificacao(user) },
						{ text: 'Sair', onPress: () => signOut(auth).then(() => setScreen('login')) },
						{
							text: 'Continuar Assim Mesmo',
							style: 'cancel',
							onPress: () => {
								console.log('✅ Login bem-sucedido (email não verificado):', user.email);
								Alert.alert(
									'Acesso Limitado',
									'Seu acesso será limitado até verificar o email.',
									[{ text: 'Continuar' }]
								);
							}
						}
					]
				);
				setLoading(false);
				return;
			}

			console.log('✅ Login bem-sucedido:', user.email);

			await updateDoc(doc(db, 'users', user.uid), {
				emailVerificado: true,
				ultimoLogin: serverTimestamp()
			});

			Alert.alert('✅ Login Bem-Sucedido', 'Bem-vindo de volta!');

		} catch (error) {
			console.error('❌ Erro no login:', error.message);
			let mensagemErro = 'Email ou password incorretos';

			if (error.code === 'auth/user-not-found') {
				mensagemErro = 'Conta não encontrada. Crie uma nova conta.';
			} else if (error.code === 'auth/wrong-password') {
				mensagemErro = 'Password incorreta';
			} else if (error.code === 'auth/invalid-email') {
				mensagemErro = 'Email inválido';
			}
			Alert.alert('❌ Erro no Login', mensagemErro);
		} finally {
			setLoading(false);
		}
	};

	const selectUserType = (type) => {
		setUserType(type);
		setScreen('registerForm');
	};

	// ================== VALIDAÇÃO DE NOME COMPLETO ==================
	const validarNomeCompleto = (nome) => {
		if (!nome || nome.trim() === '') {
			return { valido: false, mensagem: 'Nome completo é obrigatório' };
		}

		const nomeLimpo = nome.trim();
		const partesNome = nomeLimpo.split(/\s+/);

		if (partesNome.length < 2) {
			return {
				valido: false,
				mensagem: 'Insira nome completo (pelo menos nome e sobrenome)'
			};
		}

		for (const parte of partesNome) {
			if (parte.length < 2) {
				return {
					valido: false,
					mensagem: 'Cada parte do nome deve ter pelo menos 2 letras'
				};
			}
		}

		const contemApenasNumeros = /^\d+$/.test(nomeLimpo.replace(/\s/g, ''));
		if (contemApenasNumeros) {
			return {
				valido: false,
				mensagem: 'O nome não pode conter apenas números'
			};
		}

		const regexNomeValido = /^[A-Za-zÀ-ÿ\s\-\']+$/;
		if (!regexNomeValido.test(nomeLimpo)) {
			return {
				valido: false,
				mensagem: 'O nome deve conter apenas letras, espaços, hífens ou apóstrofos'
			};
		}

		return {
			valido: true,
			mensagem: 'Nome válido',
			partes: partesNome.length
		};
	};

	const handleRegister = async () => {
		// 1. Validar nome completo
		const validacaoNome = validarNomeCompleto(formData.nome);
		if (!validacaoNome.valido) {
			Alert.alert('Nome Inválido', validacaoNome.mensagem);
			return;
		}

		// 2. Validar campos obrigatórios
		const camposObrigatorios = ['nome', 'email', 'password', 'dataNascimento', 'morada', 'cidade', 'codigoPostal'];
		for (const campo of camposObrigatorios) {
			if (!formData[campo]) {
				Alert.alert('Erro', `Preencha o campo: ${campo.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
				return;
			}
		}

		// 3. Validar email
		const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!regexEmail.test(formData.email)) {
			Alert.alert('Email Inválido', 'Por favor, insira um email válido com formato: exemplo@dominio.com');
			return;
		}

		// 4. Validar password
		if (formData.password.length < 6) {
			Alert.alert('Password Fraca', 'A password deve ter pelo menos 6 caracteres');
			return;
		}

		// 5. Validar documento
		if (!nomeDocumento) {
			Alert.alert('Certidão Obrigatória', 'Por favor, selecione a certidão de morada');
			return;
		}

		// 6. Validar certificação para socorristas
		if (userType === 'com' && !formData.certificacao) {
			Alert.alert('Erro', 'Número de certificação é obrigatório para socorristas');
			return;
		}

		if (userType === 'com') {
			const resultadoValidacao = await validarComCruzVermelha(formData.certificacao);
			if (!resultadoValidacao.valido) {
				Alert.alert('Validação Falhou', resultadoValidacao.mensagem);
				return;
			}
		}

		setLoading(true);
		try {
			// Criar usuário no Firebase Auth
			const userCredential = await createUserWithEmailAndPassword(
				auth,
				formData.email,
				formData.password
			);
			const user = userCredential.user;
			console.log('✅ Conta criada no Firebase:', user.uid);

			// Enviar email de verificação
			await sendEmailVerification(user);
			console.log('✅ Email de verificação enviado');

			// Fazer upload da foto de perfil se existir
			let fotoUrl = null;
			if (fotoPerfil) {
				fotoUrl = await uploadFotoPerfil(user.uid, fotoPerfil);
			}
			// Criar documento do usuário no Firestore
			const userDoc = {
				uid: user.uid,
				nome: formData.nome,
				email: formData.email,
				dataNascimento: formData.dataNascimento,
				morada: formData.morada,
				cidade: formData.cidade,
				codigoPostal: formData.codigoPostal,
				tipo: userType,
				certificacao: userType === 'com' ? formData.certificacao : null,
				documentoCertidao: {
					nome: nomeDocumento,
					carregadoEm: serverTimestamp()
				},
				fotoPerfilUrl: fotoUrl,
				emailVerificado: false,
				dataRegisto: serverTimestamp(),
				coordenadas: {
					latitude: 41.1579 + (Math.random() * 0.1 - 0.05),
					longitude: -8.6291 + (Math.random() * 0.1 - 0.05),
				}
			};

			await setDoc(doc(db, 'users', user.uid), userDoc);
			console.log('✅ Dados salvos');

			// Mostrar alerta com instruções
			Alert.alert(
				'✅ Conta Criada!',
				`${userType === 'com' ? 'Socorrista' : 'Utilizador'} registado com sucesso!\n\n` +
				`📧 **Enviamos email de verificação para:**\n${formData.email}\n\n` +
				`⚠️ **VERIFIQUE A PASTA SPAM!**\n` +
				`2. Clique no link de verificação\n` +
				`3. Volte ao app e faça login\n` +
				`📌 **Dica:** Marque como "Não é spam" para evitar futuros problemas.`,
				[
					{
						text: '⚠️ Reenviar Email (SPAM?)',
						onPress: () => reenviarEmailVerificacao(user)
					},
					{
						text: 'Fazer Login Agora',
						onPress: () => {
							signOut(auth);
							setScreen('login');
						}
					}
				]
			);

			// Fazer logout automático
			await signOut(auth);
			setScreen('verificarEmail');

		} catch (error) {
			console.error('❌ Erro no registo:', error.message);
			let mensagemErro = 'Erro ao criar conta';

			if (error.code === 'auth/email-already-in-use') {
				mensagemErro = 'Este email já está registado';
			} else if (error.code === 'auth/weak-password') {
				mensagemErro = 'Password muito fraca (mínimo 6 caracteres)';
			} else if (error.code === 'auth/invalid-email') {
				mensagemErro = 'Email inválido. Use formato: exemplo@dominio.com';
			} else if (error.code === 'auth/operation-not-allowed') {
				mensagemErro = 'Operação não permitida. Contacte o suporte.';
			}

			Alert.alert('❌ Erro no Registo', mensagemErro);
		} finally {
			setLoading(false);
		}
	};

	// ================== FUNÇÃO PARA REENVIAR EMAIL ==================
	const reenviarEmailVerificacao = async (user) => {
		setLoading(true);
		try {
			await sendEmailVerification(user);

			Alert.alert(
				'📧 Email Enviado!',
				`Enviamos o link de verificação para:\n\n` +
				`📭 **${user.email}**\n\n` +
				`⚠️ **ATENÇÃO IMPORTANTE:**\n` +
				`O email pode estar na pasta **SPAM** ou **LIXO**!\n\n` +
				`🔍 **Onde procurar:**\n` +
				`✅ Pasta SPAM\n` +
				`✅ Caixa "Promoções" (Gmail)\n` +
				`✅ Pasta "Todos" do Gmail\n` +
				`✅ Pasta "Outros" (Outlook)\n\n` +
				`📌 **Dica:** Marque como "Não é spam" para emails futuros`,
				[
					{
						text: 'Abrir Email Agora',
						onPress: () => abrirAppEmail(user.email)
					},
					{ text: 'OK' }
				]
			);
		} catch (error) {
			console.error('Erro ao reenviar email:', error);
			Alert.alert(
				'❌ Erro',
				`Não foi possível enviar o email.\n\n` +
				`Erro: ${error.message}\n\n` +
				`Tente novamente ou contacte suporte.`
			);
		} finally {
			setLoading(false);
		}
	};

	// ================== FUNÇÃO PARA ABRIR APP DE EMAIL ==================
	const abrirAppEmail = (email) => {
		const dominio = email.split('@')[1];

		const appsEmail = {
			'gmail.com': 'https://mail.google.com',
			'outlook.com': 'https://outlook.live.com',
			'hotmail.com': 'https://outlook.live.com',
			'yahoo.com': 'https://mail.yahoo.com',
			'icloud.com': 'https://www.icloud.com/mail'
		};

		const url = appsEmail[dominio] || `https://${dominio}`;

		Linking.openURL(url).catch(() => {
			Alert.alert(
				'Não foi possível abrir',
				`Abra manualmente seu email: ${email}`
			);
		});
	};

	// ================== FUNÇÕES DE AJUDA ==================
	const calcularDistancia = (loc1, loc2) => {
		if (!loc1 || !loc2) return 0;
		const latDiff = Math.abs(loc1.latitude - loc2.latitude) * 111320;
		const lonDiff = Math.abs(loc1.longitude - loc2.longitude) * 111320 * Math.cos(loc1.latitude * Math.PI / 180);
		const distanciaMetros = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
		return Math.round(distanciaMetros);
	};

	const calcularTempoEstimado = (distanciaMetros) => {
		const velocidadeMedia = 1.4;
		const tempoSegundos = distanciaMetros / velocidadeMedia;
		const tempoMinutos = Math.ceil(tempoSegundos / 60);
		if (tempoMinutos <= 1) return '1 minuto';
		if (tempoMinutos <= 5) return `${tempoMinutos} minutos`;
		if (tempoMinutos <= 60) return `${tempoMinutos} minutos`;
		return `${Math.ceil(tempoMinutos / 60)} horas`;
	};

	// FUNÇÃO PARA INICIAR CONTAGEM REGRESSIVA
	const pedirAjuda = async () => {
		if (!localizacaoAtual) {
			Alert.alert('Erro', 'Localização não disponível');
			return;
		}

		if (!firebaseUser) {
			Alert.alert('Erro', 'Não está autenticado');
			return;
		}

		// Iniciar contagem regressiva
		setPedidoContagem(true);
		setTempoRestante(3);
	};

	// FUNÇÃO PARA CANCELAR DURANTE A CONTAGEM
	const cancelarPedidoAjuda = () => {
		setPedidoContagem(false);
		setTempoRestante(3);
		Alert.alert('Pedido Cancelado', 'O pedido de ajuda foi cancelado.');
	};

	// FUNÇÃO PARA ENVIAR O PEDIDO APÓS CONTAGEM
	const enviarPedidoAjuda = async () => {
		try {
			const pedido = {
				userId: firebaseUser.uid,
				nome: userData?.nome || formData.nome,
				email: firebaseUser.email,
				localizacao: {
					latitude: localizacaoAtual.latitude,
					longitude: localizacaoAtual.longitude,
				},
				morada: `${formData.morada}, ${formData.cidade}`,
				timestamp: serverTimestamp(),
				status: 'pendente',
				distancia: 'A calcular...',
				tempoEstimado: '---',
				fotoPerfilUrl: userData?.fotoPerfilUrl || null
			};

			await addDoc(collection(db, 'pedidos'), pedido);

			Alert.alert(
				'✅ Ajuda Solicitada',
				'Pedido enviado com sucesso! Socorristas foram alertados.',
				[{ text: 'OK' }]
			);
		} catch (error) {
			console.error('❌ Erro ao criar pedido:', error);
			Alert.alert('Erro', 'Não foi possível criar pedido');
		}
	};

	// ================== FUNÇÃO VER PEDIDOS PROXIMOS ==================
	const verPedidosProximos = () => {
		if (socorristaEmMissao) {
			Alert.alert(
				'Já está em missão',
				'Já estás a ajudar alguém. Conclui ou cancela a missão atual primeiro.',
				[{ text: 'OK' }]
			);
			return;
		}

		if (!localizacaoAtual) {
			Alert.alert('Erro', 'Localização não disponível');
			return;
		}

		if (pedidosAtivos.length === 0) {
			Alert.alert(
				'Sem pedidos ativos',
				'Não há pedidos de ajuda na sua área.',
				[{ text: 'OK' }]
			);
			return;
		}

		const pedido = pedidosAtivos[0];
		const distanciaMetros = calcularDistancia(localizacaoAtual, pedido.localizacao);
		const distanciaFormatada = distanciaMetros >= 1000
			? `${(distanciaMetros / 1000).toFixed(1)} km`
			: `${distanciaMetros} m`;

		const pedidoAtualizado = {
			...pedido,
			distancia: distanciaFormatada,
			tempoEstimado: calcularTempoEstimado(distanciaMetros)
		};

		setSocorristaEmMissao(pedidoAtualizado);
		setScreen('mapaAjuda');
	};

	const aceitarMissao = async () => {
		if (!socorristaEmMissao) return;

		try {
			const aceiteEm = serverTimestamp();

			await updateDoc(doc(db, 'pedidos', socorristaEmMissao.id), {
				status: 'em_andamento',
				socorristaId: firebaseUser.uid,
				socorristaNome: userData?.nome,
				aceiteEm: aceiteEm
			});

			setSocorristaEmMissao({
				...socorristaEmMissao,
				status: 'em_andamento',
				aceiteEm: aceiteEm
			});

			Alert.alert(
				'🚑 Missão Aceite!',
				`Missão aceite com sucesso!\n\n` +
				`• Pessoa: ${socorristaEmMissao.nome}\n` +
				`• Distância: ${socorristaEmMissao.distancia}\n` +
				`• Tempo estimado: ${socorristaEmMissao.tempoEstimado}\n\n` +
				`Agora pode iniciar a navegação com o botão abaixo.`,
				[{ text: 'Continuar' }]
			);
		} catch (error) {
			console.error('❌ Erro ao aceitar missão:', error);
			Alert.alert('Erro', 'Não foi possível aceitar missão');
		}
	};

	// ================== FUNÇÕES DE NAVEGAÇÃO COM VOZ ==================
	const abrirNavegacaoComVoz = (appPreferido = 'google') => {
		if (!socorristaEmMissao?.localizacao || !localizacaoAtual) {
			Alert.alert('Erro', 'Localização não disponível');
			return;
		}

		const { latitude, longitude } = socorristaEmMissao.localizacao;

		const appsConfig = {
			google: {
				url: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving&dir_action=navigate`,
				loja: Platform.OS === 'ios'
					? 'https://apps.apple.com/app/google-maps/id585027354'
					: 'market://details?id=com.google.android.apps.maps'
			},
			waze: {
				url: `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`,
				loja: Platform.OS === 'ios'
					? 'https://apps.apple.com/app/waze/id323229106'
					: 'market://details?id=com.waze'
			},
			apple: {
				url: `http://maps.apple.com/?daddr=${latitude},${longitude}&dirflg=d&t=m`,
				loja: null
			}
		};

		const app = appsConfig[appPreferido] || appsConfig.google;

		Linking.openURL(app.url).catch(() => {
			if (app.loja) {
				Alert.alert(
					'App não instalado',
					`${appPreferido === 'google' ? 'Google Maps' : 'Waze'} não está instalado. Deseja instalar?`,
					[
						{ text: 'Cancelar', style: 'cancel' },
						{ text: 'Instalar', onPress: () => Linking.openURL(app.loja) }
					]
				);
			}
		});
	};

	const escolherAppNavegacao = () => {
		if (!socorristaEmMissao) return;

		const opcoes = [
			{ text: '🗺️ Google Maps', app: 'google' },
			{ text: '🚗 Waze', app: 'waze' }
		];

		if (Platform.OS === 'ios') {
			opcoes.push({ text: '🍎 Apple Maps', app: 'apple' });
		}

		opcoes.push({ text: 'Cancelar', style: 'cancel' });

		Alert.alert(
			'🚑 Navegação até à vítima',
			'Escolha o app para navegação com voz:',
			opcoes.map(opcao => ({
				text: opcao.text,
				style: opcao.style || 'default',
				onPress: opcao.app ? () => abrirNavegacaoComVoz(opcao.app) : undefined
			}))
		);
	};

	// ================== FUNÇÃO PARA CONCLUIR MISSÃO ==================
	const concluirMissao = async () => {
		if (!socorristaEmMissao) return;

		Alert.alert(
			'✅ Concluir Missão',
			'Confirmas que chegaste à vítima e prestaste os primeiros socorros?',
			[
				{ text: 'Cancelar', style: 'cancel' },
				{
					text: 'Sim, Concluir',
					onPress: async () => {
						try {
							const tempoResgate = calcularTempoResgate();

							// 1. Atualizar o pedido no Firestore
							await updateDoc(doc(db, 'pedidos', socorristaEmMissao.id), {
								status: 'concluido',
								concluidoEm: serverTimestamp(),
								socorristaChegou: true,
								tempoResgate: tempoResgate || '---'
							});

							// 2. Atualizar as estatísticas do socorrista
							if (firebaseUser) {
								// Buscar dados atuais do socorrista
								const socorristaDoc = await getDoc(doc(db, 'users', firebaseUser.uid));

								if (socorristaDoc.exists()) {
									const socorristaData = socorristaDoc.data();

									// Calcular novas estatísticas
									const missoesConcluidas = (socorristaData.missoesConcluidas || 0) + 1;

									// Converter tempoResgate para minutos
									let tempoTotalMinutos = socorristaData.tempoTotalResgateMinutos || 0;

									if (tempoResgate) {
										// Extrair minutos do tempoResgate (ex: "15 min", "1h 30min", etc.)
										if (tempoResgate.includes('min') && !tempoResgate.includes('h')) {
											// Apenas minutos (ex: "15 min")
											const minutos = parseInt(tempoResgate) || 0;
											tempoTotalMinutos += minutos;
										} else if (tempoResgate.includes('h')) {
											// Horas e minutos (ex: "1h 30min")
											const partes = tempoResgate.split(' ');
											let horas = 0;
											let minutos = 0;

											partes.forEach(parte => {
												if (parte.includes('h')) {
													horas = parseInt(parte) || 0;
												} else if (parte.includes('min')) {
													minutos = parseInt(parte) || 0;
												}
											});

											tempoTotalMinutos += (horas * 60) + minutos;
										}
									}

									// Atualizar estatísticas no Firestore
									await updateDoc(doc(db, 'users', firebaseUser.uid), {
										missoesConcluidas: missoesConcluidas,
										tempoTotalResgateMinutos: tempoTotalMinutos,
										ultimaMissaoConcluida: serverTimestamp(),
										ajudaPrestada: (socorristaData.ajudaPrestada || 0) + 1
									});

									console.log(`✅ Estatísticas atualizadas: ${missoesConcluidas} missões, ${tempoTotalMinutos} minutos`);
								}
							}

							// 3. Limpar estado local
							setSocorristaEmMissao(null);

							// 4. Mostrar alerta com estatísticas
							const tempoFormatado = tempoResgate || '---';

							Alert.alert(
								'🎉 Missão Concluída!',
								`Ajuda prestada com sucesso!\n\n` +
								`📊 **Estatísticas desta missão:**\n` +
								`• Tempo de resgate: ${tempoFormatado}\n` +
								`• Status: Concluída ✅\n\n` +
								`Os seus dados foram atualizados no perfil.`,
								[{ text: 'Voltar ao Início', onPress: () => setScreen('home') }]
							);

						} catch (error) {
							console.error('❌ Erro ao concluir missão:', error);
							Alert.alert('Erro', 'Não foi possível concluir a missão');
						}
					}
				}
			]
		);
	};

	const handleLogout = async () => {
		try {
			await signOut(auth);
			setFirebaseUser(null);
			setUserData(null);
			setUserType('');
			setNomeDocumento('');
			setSocorristaEmMissao(null);
			setPedidosAtivos([]);
			setFotoPerfil(null);
			setFotoUri(null);
			setPedidoContagem(false); // Limpar contagem ao fazer logout
			setTempoRestante(3);
			setFormData({
				nome: '',
				email: '',
				password: '',
				dataNascimento: '',
				certificacao: '',
				morada: '',
				cidade: '',
				codigoPostal: '',
			});
			setScreen('login');
		} catch (error) {
			console.error('❌ Erro ao fazer logout:', error);
		}
	};

	// ================== ECRÃ DE PERFIL ==================
	const irParaPerfil = () => {
		// Garantir que a foto atual é carregada
		if (userData?.fotoPerfilUrl) {
			setFotoUri(userData.fotoPerfilUrl);
			setFotoPerfil(null); // Limpar foto temporária
		}
		setScreen('perfil');
	};

	// ================== COMPONENTE DE CONTAGEM REGRESSIVA ==================
	const ContagemRegressivaOverlay = () => {
		const [scale, setScale] = useState(1);

		useEffect(() => {
			if (!pedidoContagem) return;

			const animacao = setInterval(() => {
				setScale(prev => prev === 1 ? 1.3 : 1);
			}, 600);

			return () => clearInterval(animacao);
		}, [pedidoContagem]);

		if (!pedidoContagem) return null;

		return (
			<View style={styles.overlayContainer}>
				<View style={styles.overlayBackground}>
					<View style={[styles.pulsingCircle, { transform: [{ scale }] }]}>
						<Text style={styles.pulsingText}>{tempoRestante}</Text>
					</View>

					<Text style={styles.overlayTitle}>Enviando Pedido de Ajuda</Text>
					<Text style={styles.overlaySubtitle}>
						{tempoRestante === 3 ? 'A iniciar em...' :
							tempoRestante === 2 ? 'A preparar pedido...' :
								tempoRestante === 1 ? 'Último segundo...' :
									'A enviar...'}
					</Text>

					<TouchableOpacity
						style={styles.cancelOverlayButton}
						onPress={cancelarPedidoAjuda}
					>
						<Text style={styles.cancelOverlayButtonText}>❌ CANCELAR PEDIDO</Text>
					</TouchableOpacity>

					<Text style={styles.overlayWarning}>
						O pedido será enviado automaticamente quando a contagem chegar a 0
					</Text>
				</View>
			</View>
		);
	};

	// ================== ECRÃS ==================
	if (screen === 'login') {
		return (
			<ScrollView contentContainerStyle={styles.container}>
				<Text style={styles.title}> Vita4All</Text>
				<Text style={styles.subtitle}>Sistema de Emergência com Firebase</Text>

				<TextInput
					style={styles.input}
					placeholder="Email (ex: nome@email.com)"
					value={formData.email}
					onChangeText={(text) => setFormData({ ...formData, email: text })}
					keyboardType="email-address"
					autoCapitalize="none"
					autoCorrect={false}
				/>

				<TextInput
					style={styles.input}
					placeholder="Password (mínimo 6 caracteres)"
					value={formData.password}
					onChangeText={(text) => setFormData({ ...formData, password: text })}
					secureTextEntry
				/>

				{loading ? (
					<ActivityIndicator size="large" color="#e74c3c" style={{ marginVertical: 20 }} />
				) : (
					<TouchableOpacity style={styles.primaryButton} onPress={handleLogin}>
						<Text style={styles.buttonText}>ENTRAR</Text>
					</TouchableOpacity>
				)}

				<TouchableOpacity
					style={styles.secondaryButton}
					onPress={() => setScreen('registerType')}
				>
					<Text style={styles.secondaryButtonText}>CRIAR NOVA CONTA</Text>
				</TouchableOpacity>

				{firebaseUser && (
					<Text style={styles.firebaseInfo}>
						🔥 Firebase conectado: {firebaseUser.email}
					</Text>
				)}

				{firebaseUser && !firebaseUser.emailVerified && (
					<TouchableOpacity
						style={styles.verifyButton}
						onPress={() => reenviarEmailVerificacao(firebaseUser)}
					>
						<Text style={styles.verifyButtonText}>
							📧 Reenviar Email de Verificação
						</Text>
					</TouchableOpacity>
				)}

				{/* Overlay de Contagem Regressiva */}
				<ContagemRegressivaOverlay />
			</ScrollView>
		);
	}

	if (screen === 'registerType') {
		return (
			<View style={styles.container}>
				<Text style={styles.title}>Tipo de Utilizador</Text>

				<TouchableOpacity
					style={[styles.optionCard, styles.certifiedCard]}
					onPress={() => selectUserType('com')}
				>
					<Text style={styles.optionTitle}>🩺 SOCORRISTA</Text>
					<Text style={styles.optionDesc}>Com certificação Cruz Vermelha</Text>
					<Text style={styles.optionBullet}>• Validação via API</Text>
					<Text style={styles.optionBullet}>• Recebe pedidos de ajuda</Text>
					<Text style={styles.optionBullet}>• Foto de perfil obrigatória</Text>
				</TouchableOpacity>

				<TouchableOpacity
					style={[styles.optionCard, styles.normalCard]}
					onPress={() => selectUserType('sem')}
				>
					<Text style={styles.optionTitle}>👤 UTILIZADOR</Text>
					<Text style={styles.optionDesc}>Pode precisar de ajuda</Text>
					<Text style={styles.optionBullet}>• Pede ajuda a socorristas</Text>
					<Text style={styles.optionBullet}>• Morada verificada</Text>
					<Text style={styles.optionBullet}>• Foto de perfil opcional</Text>
				</TouchableOpacity>

				<TouchableOpacity onPress={() => setScreen('login')}>
					<Text style={styles.link}>← Voltar</Text>
				</TouchableOpacity>

				{/* Overlay de Contagem Regressiva */}
				<ContagemRegressivaOverlay />
			</View>
		);
	}

	if (screen === 'registerForm') {
		return (
			<ScrollView contentContainerStyle={styles.container}>
				<Text style={styles.title}>
					{userType === 'com' ? 'REGISTO DE SOCORRISTA' : 'REGISTO NA COMUNIDADE'}
				</Text>

				{/* Seção da Foto de Perfil */}
				<Text style={styles.sectionLabel}>Foto de Perfil {userType === 'com' ? '* (Obrigatória)' : '(Opcional)'}</Text>

				<View style={styles.photoPreviewContainer}>
					{fotoUri ? (
						<Image source={{ uri: fotoUri }} style={styles.photoPreview} />
					) : (
						<View style={[styles.photoPreview, styles.photoPreviewPlaceholder]}>
							<Text style={styles.photoPreviewText}>
								{formData.nome ? formData.nome.charAt(0) : '?'}
							</Text>
						</View>
					)}
				</View>

				<View style={styles.photoButtonsRow}>
					<TouchableOpacity
						style={[styles.smallButton, styles.photoActionButton]}
						onPress={tirarFoto}
					>
						<Text style={styles.smallButtonText}>📷 Tirar</Text>
					</TouchableOpacity>

					<TouchableOpacity
						style={[styles.smallButton, styles.photoActionButton]}
						onPress={escolherFotoGaleria}
					>
						<Text style={styles.smallButtonText}>🖼️ Escolher</Text>
					</TouchableOpacity>

					{fotoUri && (
						<TouchableOpacity
							style={[styles.smallButton, styles.removePhotoPreviewButton]}
							onPress={removerFoto}
						>
							<Text style={styles.smallButtonText}>🗑️</Text>
						</TouchableOpacity>
					)}
				</View>

				<Text style={styles.sectionLabel}>Dados Pessoais</Text>
				<TextInput
					style={styles.input}
					placeholder="Nome Completo *"
					value={formData.nome}
					onChangeText={(text) => setFormData({ ...formData, nome: text })}
				/>

				<TextInput
					style={styles.input}
					placeholder="Email * (ex: nome@email.com)"
					value={formData.email}
					onChangeText={(text) => setFormData({ ...formData, email: text })}
					keyboardType="email-address"
					autoCapitalize="none"
					autoCorrect={false}
				/>

				<TextInput
					style={styles.input}
					placeholder="Password (mínimo 6 caracteres) *"
					value={formData.password}
					onChangeText={(text) => setFormData({ ...formData, password: text })}
					secureTextEntry
				/>

				<Text style={styles.sectionLabel}>Data de Nascimento *</Text>

				<TouchableOpacity
					style={styles.dateInputContainer}
					onPress={showDatePickerModal}
				>
					<Text style={[
						styles.dateInputText,
						!formData.dataNascimento && styles.dateInputPlaceholder
					]}>
						{formData.dataNascimento || 'Toque para selecionar data 📅'}
					</Text>
				</TouchableOpacity>

				{showDatePicker && (
					<DateTimePicker
						testID="dateTimePicker"
						value={selectedDate}
						mode="date"
						display={Platform.OS === 'ios' ? 'spinner' : 'default'}
						onChange={onChangeDate}
						maximumDate={new Date()}
						minimumDate={new Date(1900, 0, 1)}
						locale="pt-PT"
					/>
				)}

				{/* Botão para cancelar date picker no iOS */}
				{showDatePicker && Platform.OS === 'ios' && (
					<TouchableOpacity
						style={styles.cancelDateButton}
						onPress={cancelDatePicker}
					>
						<Text style={styles.cancelDateButtonText}>Cancelar</Text>
					</TouchableOpacity>
				)}

				<Text style={styles.sectionLabel}>Morada *</Text>
				<TextInput
					style={styles.input}
					placeholder="Morada (Rua, Número) *"
					value={formData.morada}
					onChangeText={(text) => setFormData({ ...formData, morada: text })}
				/>

				<View style={styles.row}>
					<TextInput
						style={[styles.input, styles.halfInput]}
						placeholder="Código Postal *"
						value={formData.codigoPostal}
						onChangeText={(text) => setFormData({ ...formData, codigoPostal: text })}
					/>
					<TextInput
						style={[styles.input, styles.halfInput]}
						placeholder="Cidade *"
						value={formData.cidade}
						onChangeText={(text) => setFormData({ ...formData, cidade: text })}
					/>
				</View>

				<Text style={styles.sectionLabel}>Certidão de Morada *</Text>

				<View style={styles.documentArea}>
					<Text style={styles.documentStatus}>
						{nomeDocumento ? '✅ DOCUMENTO SELECIONADO' : '❌ AGUARDA DOCUMENTO'}
					</Text>

					<TouchableOpacity
						style={[
							styles.docButton,
							nomeDocumento ? styles.docButtonActive : styles.docButtonInactive
						]}
						onPress={selecionarCertidao}
					>
						<Text style={styles.docIcon}>
							{nomeDocumento ? '📎' : '📁'}
						</Text>
						<Text style={styles.docMainText}>
							{nomeDocumento ? 'ALTERAR DOCUMENTO' : 'SELECIONAR CERTIDÃO'}
						</Text>
						<Text style={styles.docSubText}>
							{nomeDocumento ? nomeDocumento : 'Toque para escolher ficheiro'}
						</Text>
					</TouchableOpacity>
				</View>

				{userType === 'com' && (
					<>
						<Text style={styles.sectionLabel}>Certificação Cruz Vermelha *</Text>
						<TextInput
							style={styles.input}
							placeholder="Número de certificação (ex: CV2024-001)"
							value={formData.certificacao}
							onChangeText={(text) => setFormData({ ...formData, certificacao: text })}
						/>
					</>
				)}

				{fotoCarregando && (
					<View style={styles.loadingBox}>
						<ActivityIndicator size="small" color="#e74c3c" />
						<Text style={styles.loadingText}>A processar foto...</Text>
					</View>
				)}

				{loading ? (
					<View style={styles.loadingBox}>
						<ActivityIndicator size="large" color="#e74c3c" />
						<Text style={styles.loadingText}>
							{userType === 'com' ? 'Validando certificação...' : 'A criar conta...'}
						</Text>
					</View>
				) : (
					<TouchableOpacity
						style={[
							styles.primaryButton,
							(userType === 'com' && !fotoUri) && styles.buttonDisabled
						]}
						onPress={handleRegister}
						disabled={(userType === 'com' && !fotoUri) || loading}
					>
						<Text style={styles.buttonText}>
							{userType === 'com' ? 'VALIDAR E REGISTAR' : 'COMPLETAR REGISTO'}
						</Text>
						{userType === 'com' && !fotoUri && (
							<Text style={styles.requiredText}>(Foto obrigatória)</Text>
						)}
					</TouchableOpacity>
				)}

				<TouchableOpacity onPress={() => setScreen('registerType')}>
					<Text style={styles.link}>← Voltar</Text>
				</TouchableOpacity>

				{/* Overlay de Contagem Regressiva */}
				<ContagemRegressivaOverlay />
			</ScrollView>
		);
	}

	// ================== ECRÃ DE VERIFICAR EMAIL ==================
	if (screen === 'verificarEmail' && firebaseUser) {
		return (
			<View style={styles.container}>
				<Text style={styles.title}>📧 Verifique seu Email</Text>

				<View style={styles.emailBox}>
					<Text style={styles.emailIcon}>📭</Text>
					<Text style={styles.emailAddress}>{firebaseUser.email}</Text>
					<Text style={styles.emailStatus}>
						{firebaseUser.emailVerified ? '✅ VERIFICADO' : '⏳ AGUARDANDO'}
					</Text>
				</View>

				<View style={styles.warningBox}>
					<Text style={styles.warningTitle}>⚠️ ATENÇÃO</Text>
					<Text style={styles.warningText}>
						Os emails costumam ir para a pasta <Text style={styles.highlight}>SPAM</Text>!
					</Text>
					<Text style={styles.warningSubtext}>
						Verifique todas as pastas, incluindo SPAM, Lixo, Promoções.
					</Text>
				</View>

				<View style={styles.instructionsBox}>
					<Text style={styles.instructionsTitle}>📋 Passos:</Text>
					<Text style={styles.instruction}>1. Abra o seu email</Text>
					<Text style={styles.instruction}>2. Procure na pasta SPAM</Text>
					<Text style={styles.instruction}>3. Clique no link de verificação</Text>
					<Text style={styles.instruction}>4. Volte aqui e clique abaixo</Text>
				</View>

				<TouchableOpacity
					style={styles.primaryButton}
					onPress={async () => {
						await firebaseUser.reload();

						if (firebaseUser.emailVerified) {
							Alert.alert(
								'Email Verificado!',
								[{ text: 'Continuar', onPress: () => setScreen('home') }]
							);
						} else {
							Alert.alert(
								'Ainda não verificado',
								'O email ainda não foi verificado. Verifique sua caixa de entrada.',
								[{ text: 'OK' }]
							);
						}
					}}
				>
					<Text style={styles.buttonText}>✅ JÁ VERIFIQUEI MEU EMAIL</Text>
				</TouchableOpacity>

				<TouchableOpacity
					style={styles.secondaryButton}
					onPress={() => reenviarEmailVerificacao(firebaseUser)}
				>
					<Text style={styles.secondaryButtonText}>📧 REENVIAR EMAIL</Text>
				</TouchableOpacity>

				<TouchableOpacity
					style={styles.linkButton}
					onPress={() => abrirAppEmail(firebaseUser.email)}
				>
					<Text style={styles.linkButtonText}>📱 ABRIR A APP DO EMAIL</Text>
				</TouchableOpacity>

				<TouchableOpacity
					style={styles.logoutButton}
					onPress={handleLogout}
				>
					<Text style={styles.logoutText}>SAIR</Text>
				</TouchableOpacity>

				{/* Overlay de Contagem Regressiva */}
				<ContagemRegressivaOverlay />
			</View>
		);
	}

	// ================== ECRÃ DE PERFIL ==================
	if (screen === 'perfil' && firebaseUser && userData) {
		const isSocorrista = userType === 'com';

		return (
			<ScrollView contentContainerStyle={styles.container}>
				<View style={styles.headerContainer}>
					<TouchableOpacity
						style={styles.backButton}
						onPress={() => setScreen('home')}
					>
						<Text style={styles.backButtonText}>←</Text>
					</TouchableOpacity>
					<Text style={styles.title}>👤 Perfil</Text>
				</View>

				{/* Foto de Perfil */}
				<View style={styles.profilePhotoSection}>
					<View style={styles.photoContainer}>
						{fotoUri || userData.fotoPerfilUrl ? (
							<Image
								source={{ uri: fotoUri || userData.fotoPerfilUrl }}
								style={styles.profilePhoto}
							/>
						) : (
							<View style={[styles.profilePhoto, styles.photoPlaceholder]}>
								<Text style={styles.photoPlaceholderText}>
									{userData.nome?.charAt(0) || '?'}
								</Text>
							</View>
						)}

						{fotoCarregando && (
							<View style={styles.photoLoading}>
								<ActivityIndicator size="small" color="#fff" />
							</View>
						)}
					</View>

					<View style={styles.photoButtons}>
						<TouchableOpacity
							style={[styles.smallButton, styles.photoButton]}
							onPress={tirarFoto}
						>
							<Text style={styles.smallButtonText}>📷 Tirar Foto</Text>
						</TouchableOpacity>

						<TouchableOpacity
							style={[styles.smallButton, styles.photoButton]}
							onPress={escolherFotoGaleria}
						>
							<Text style={styles.smallButtonText}>🖼️ Galeria</Text>
						</TouchableOpacity>

						{(fotoUri || userData.fotoPerfilUrl) && (
							<TouchableOpacity
								style={[styles.smallButton, styles.removePhotoButton]}
								onPress={removerFoto}
							>
								<Text style={styles.smallButtonText}>🗑️ Remover</Text>
							</TouchableOpacity>
						)}
					</View>
				</View>

				{/* Informações do Usuário */}
				<View style={styles.profileInfoBox}>
					<Text style={styles.profileSectionTitle}>📋 Informações Pessoais</Text>

					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>Nome:</Text>
						<Text style={styles.infoValue}>{userData.nome}</Text>
					</View>

					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>Email:</Text>
						<Text style={styles.infoValue}>{userData.email}</Text>
					</View>

					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>Data Nascimento:</Text>
						<Text style={styles.infoValue}>{userData.dataNascimento}</Text>
					</View>

					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>Tipo:</Text>
						<Text style={[
							styles.infoValue,
							isSocorrista ? styles.socorristaBadge : styles.userBadge
						]}>
							{isSocorrista ? '🩺 Socorrista' : '👤 Utilizador'}
						</Text>
					</View>

					{isSocorrista && userData.certificacao && (
						<View style={styles.infoRow}>
							<Text style={styles.infoLabel}>Certificação:</Text>
							<Text style={[styles.infoValue, styles.certificationBadge]}>
								✅ {userData.certificacao}
							</Text>
						</View>
					)}
				</View>

				{/* Morada */}
				<View style={styles.profileInfoBox}>
					<Text style={styles.profileSectionTitle}>📍 Morada</Text>

					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>Morada:</Text>
						<Text style={styles.infoValue}>{userData.morada}</Text>
					</View>

					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>Cidade:</Text>
						<Text style={styles.infoValue}>{userData.cidade}</Text>
					</View>

					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>Código Postal:</Text>
						<Text style={styles.infoValue}>{userData.codigoPostal}</Text>
					</View>
				</View>

				{/* Documentos */}
				<View style={styles.profileInfoBox}>
					<Text style={styles.profileSectionTitle}>📄 Documentos</Text>

					{userData.documentoCertidao && (
						<View style={styles.infoRow}>
							<Text style={styles.infoLabel}>Certidão:</Text>
							<Text style={styles.infoValue}>{userData.documentoCertidao.nome}</Text>
						</View>
					)}

					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>Email Verificado:</Text>
						<Text style={[
							styles.infoValue,
							firebaseUser.emailVerified ? styles.verifiedBadge : styles.pendingBadge
						]}>
							{firebaseUser.emailVerified ? '✅ Sim' : '⚠️ Pendente'}
						</Text>
					</View>
				</View>

				{/* Estatísticas */}
				{isSocorrista && (
					<View style={styles.statsBox}>
						<Text style={styles.profileSectionTitle}>📊 Estatísticas</Text>

						<View style={styles.statsGrid}>
							<View style={styles.statItem}>
								<Text style={styles.statNumber}>
									{userData.missoesConcluidas || 0}
								</Text>
								<Text style={styles.statLabel}>Missões</Text>
							</View>

							<View style={styles.statItem}>
								<Text style={styles.statNumber}>
									{userData.ajudaPrestada || 0}
								</Text>
								<Text style={styles.statLabel}>Ajudados</Text>
							</View>

							<View style={styles.statItem}>
								<Text style={styles.statNumber}>
									{formatarTempoTotal(userData.tempoTotalResgateMinutos)}
								</Text>
								<Text style={styles.statLabel}>Tempo Total</Text>
							</View>
						</View>

						{userData.ultimaMissaoConcluida && (
							<Text style={styles.lastMissionText}>
								Última missão: {formatarData(userData.ultimaMissaoConcluida)}
							</Text>
						)}
					</View>
				)}

				{/* Botões de Ação */}
				{fotoPerfil && (
					<TouchableOpacity
						style={styles.primaryButton}
						onPress={atualizarFotoPerfil}
						disabled={fotoCarregando}
					>
						{fotoCarregando ? (
							<ActivityIndicator size="small" color="#fff" />
						) : (
							<Text style={styles.buttonText}>🔄 ATUALIZAR FOTO</Text>
						)}
					</TouchableOpacity>
				)}

				{/* Mostrar mensagem quando não há nova foto selecionada */}
				{!fotoPerfil && fotoUri === userData?.fotoPerfilUrl && (
					<Text style={styles.profileNote}>
						👆 Selecione uma nova foto para atualizar
					</Text>
				)}

				{/* Mostrar que há uma nova foto pronta para atualizar */}
				{fotoPerfil && fotoUri !== userData?.fotoPerfilUrl && (
					<Text style={[styles.profileNote, { color: '#27ae60' }]}>
						✅ Nova foto selecionada! Clique em "Atualizar Foto" acima
					</Text>
				)}

				{/* Botão para verificar email (se necessário) */}
				{!firebaseUser.emailVerified && (
					<TouchableOpacity
						style={styles.secondaryButton}
						onPress={() => reenviarEmailVerificacao(firebaseUser)}
					>
						<Text style={styles.secondaryButtonText}>📧 VERIFICAR EMAIL</Text>
					</TouchableOpacity>
				)}

				{/* Overlay de Contagem Regressiva */}
				<ContagemRegressivaOverlay />
			</ScrollView>
		);
	}

	// ================== ECRÃ MAPA DE AJUDA ==================
	if (screen === 'mapaAjuda' && socorristaEmMissao) {
		const missaoAceita = socorristaEmMissao?.status === 'em_andamento';

		return (
			<View style={styles.fullContainer}>
				<View style={styles.emergencyHeader}>
					<Text style={styles.emergencyTitle}>
						{missaoAceita ? '🚑 MISSÃO ACEITE' : '🆘 PEDIDO DE AJUDA'}
					</Text>
					<Text style={styles.victimName}>Vítima: {socorristaEmMissao.nome}</Text>
					<Text style={styles.victimAddress}>{socorristaEmMissao.morada}</Text>

					<View style={styles.distanceInfo}>
						<Text style={styles.distanceItem}>📏 {socorristaEmMissao.distancia}</Text>
						<Text style={styles.distanceItem}>⏱️ {socorristaEmMissao.tempoEstimado}</Text>
						{missaoAceita && (
							<Text style={styles.distanceItem}>✅ Aceite</Text>
						)}
					</View>
				</View>

				<MapView
					style={styles.map}
					initialRegion={{
						latitude: (localizacaoAtual?.latitude + socorristaEmMissao.localizacao.latitude) / 2,
						longitude: (localizacaoAtual?.longitude + socorristaEmMissao.localizacao.longitude) / 2,
						latitudeDelta: 0.05,
						longitudeDelta: 0.05,
					}}
					showsUserLocation={true}
					showsCompass={true}
				>
					<Marker
						coordinate={socorristaEmMissao.localizacao}
						title="Local da vítima"
						description={socorristaEmMissao.morada}
					>
						<View style={styles.victimMarker}>
							<Text style={styles.markerText}>🆘</Text>
						</View>
					</Marker>

					{localizacaoAtual && (
						<Marker
							coordinate={localizacaoAtual}
							title="Sua localização"
						>
							<View style={styles.rescuerMarker}>
								<Text style={styles.markerText}>🩺</Text>
							</View>
						</Marker>
					)}
				</MapView>

				<View style={styles.rescueActions}>
					{missaoAceita ? (
						<TouchableOpacity
							style={styles.voiceNavButton}
							onPress={escolherAppNavegacao}
						>
							<Text style={styles.voiceNavIcon}>🗺️</Text>
							<Text style={styles.voiceNavTitle}>INICIAR NAVEGAÇÃO COM VOZ</Text>
							<Text style={styles.voiceNavSubtitle}>Instruções faladas • Trânsito ao vivo • Desvios automáticos</Text>
						</TouchableOpacity>
					) : (
						<TouchableOpacity
							style={styles.acceptMissionButton}
							onPress={aceitarMissao}
						>
							<Text style={styles.acceptMissionIcon}>✅</Text>
							<Text style={styles.acceptMissionTitle}>ACEITAR MISSÃO</Text>
							<Text style={styles.acceptMissionSubtitle}>Ao aceitar, compromete-se a ajudar esta pessoa</Text>
						</TouchableOpacity>
					)}

					<View style={styles.actionButtonsRow}>
						{missaoAceita ? (
							<>
								<TouchableOpacity
									style={[styles.smallButton, styles.completeButton]}
									onPress={concluirMissao}
								>
									<Text style={styles.smallButtonText}>🏁 Cheguei à Vítima</Text>
								</TouchableOpacity>

								<TouchableOpacity
									style={[styles.smallButton, styles.cancelButton]}
									onPress={() => {
										Alert.alert(
											'Cancelar Missão',
											'Tens a certeza que queres cancelar esta missão?',
											[
												{ text: 'Não', style: 'cancel' },
												{
													text: 'Sim, Cancelar',
													style: 'destructive',
													onPress: async () => {
														try {
															await updateDoc(doc(db, 'pedidos', socorristaEmMissao.id), {
																status: 'pendente',
																socorristaId: null,
																socorristaNome: null
															});
															setSocorristaEmMissao(null);
															setScreen('home');
														} catch (error) {
															console.error('Erro ao cancelar missão:', error);
														}
													}
												}
											]
										);
									}}
								>
									<Text style={styles.smallButtonText}>❌ Cancelar</Text>
								</TouchableOpacity>
							</>
						) : (
							<TouchableOpacity
								style={[styles.smallButton, styles.cancelButton, { flex: 1 }]}
								onPress={() => {
									setSocorristaEmMissao(null);
									setScreen('home');
								}}
							>
								<Text style={styles.smallButtonText}>↩️ Voltar</Text>
							</TouchableOpacity>
						)}
					</View>
				</View>

				{/* Overlay de Contagem Regressiva */}
				<ContagemRegressivaOverlay />
			</View>
		);
	}

	// ================== ECRÃ HOME ==================
	if (screen === 'home' && firebaseUser && userData) {
		const isSocorrista = userType === 'com';
		const nomeUsuario = userData.nome || firebaseUser.email;

		return (
			<View style={styles.container}>
				{/* Cabeçalho com foto de perfil */}
				<View style={styles.homeHeader}>
					<TouchableOpacity
						style={styles.profileButton}
						onPress={irParaPerfil}
					>
						{fotoUri || userData.fotoPerfilUrl ? (
							<Image
								source={{ uri: fotoUri || userData.fotoPerfilUrl }}
								style={styles.homeProfilePhoto}
							/>
						) : (
							<View style={[styles.homeProfilePhoto, styles.homePhotoPlaceholder]}>
								<Text style={styles.homePhotoPlaceholderText}>
									{userData.nome?.charAt(0) || '?'}
								</Text>
							</View>
						)}
					</TouchableOpacity>

					<View style={styles.headerTextContainer}>
						<Text style={styles.welcome}>Olá, {nomeUsuario.split(' ')[0]}!</Text>
						<Text style={styles.firebaseStatus}>
							{isSocorrista ? '🩺 Socorrista' : '👤 Utilizador'}
						</Text>
					</View>
				</View>

				<Text style={styles.title}> Vita4All</Text>

				<View style={styles.infoBox}>
					<Text style={styles.infoText}>🏠 Morada: {userData.morada}, {userData.cidade}</Text>
					<Text style={styles.infoText}>📧 Email: {firebaseUser.email}</Text>
					<Text style={styles.infoText}>🎂 Data Nascimento: {userData.dataNascimento}</Text>
					{isSocorrista && userData.certificacao && (
						<Text style={styles.infoText}>🎓 Certificação: {userData.certificacao} ✅</Text>
					)}
				</View>

				<View style={styles.statusCard}>
					<Text style={styles.statusTitle}>📍 LOCALIZAÇÃO</Text>
					<Text style={styles.statusActive}>
						{localizacaoAtual ? 'ATIVA' : 'AGUARDANDO...'}
					</Text>
					<Text style={styles.statusText}>
						{localizacaoAtual ? 'Sincronizada com Firebase' : 'A ativar...'}
					</Text>
				</View>

				{isSocorrista ? (
					<>
						{socorristaEmMissao ? (
							<View style={styles.missionBox}>
								<Text style={styles.missionTitle}>🚑 EM MISSÃO ATIVA</Text>
								<Text style={styles.missionText}>
									Estás a ajudar <Text style={styles.highlightText}>{socorristaEmMissao.nome}</Text>
								</Text>
								<Text style={styles.missionDetail}>
									📍 {socorristaEmMissao.morada}
								</Text>

								<View style={styles.missionButtons}>
									<TouchableOpacity
										style={[styles.primaryButton, styles.continueButton]}
										onPress={() => setScreen('mapaAjuda')}
									>
										<Text style={styles.buttonText}>📍 IR PARA O MAPA DA MISSÃO</Text>
									</TouchableOpacity>

									<TouchableOpacity
										style={[styles.smallButton, styles.cancelMissionButton]}
										onPress={() => {
											Alert.alert(
												'Cancelar Missão',
												'Tens a certeza que queres cancelar esta missão?',
												[
													{ text: 'Não', style: 'cancel' },
													{
														text: 'Sim, Cancelar',
														style: 'destructive',
														onPress: async () => {
															try {
																await updateDoc(doc(db, 'pedidos', socorristaEmMissao.id), {
																	status: 'pendente',
																	socorristaId: null,
																	socorristaNome: null
																});
																setSocorristaEmMissao(null);
															} catch (error) {
																console.error('Erro ao cancelar missão:', error);
															}
														}
													}
												]
											);
										}}
									>
										<Text style={styles.smallButtonText}>❌ Cancelar Missão</Text>
									</TouchableOpacity>
								</View>
							</View>
						) : (
							<>
								<Text style={styles.sectionTitle}>DISPONÍVEL PARA AJUDAR</Text>

								{pedidosAtivos.length > 0 ? (
									<View style={styles.availableBox}>
										<Text style={styles.alertText}>
											🚨 {pedidosAtivos.length} PESSOA(S) PRECISA(M) DE AJUDA!
										</Text>

										<View style={styles.pedidosInfo}>
											<Text style={styles.pedidosCount}>
												📋 Pedidos ativos: {pedidosAtivos.length}
											</Text>
											<Text style={styles.pedidosInstruction}>
												Toque abaixo para ver e aceitar um pedido
											</Text>
										</View>

										<TouchableOpacity
											style={styles.primaryButton}
											onPress={verPedidosProximos}
										>
											<Text style={styles.buttonText}>
												🗺️ VER PEDIDOS E INICIAR RESGATE
											</Text>
										</TouchableOpacity>
									</View>
								) : (
									<View style={styles.noRequestsBox}>
										<Text style={styles.noRequestsIcon}>👁️</Text>
										<Text style={styles.noRequestsText}>
											A PROCURAR PEDIDOS DE AJUDA...
										</Text>
										<Text style={styles.noRequestsSubtext}>
											Serás notificado quando alguém pedir ajuda
										</Text>
									</View>
								)}
							</>
						)}
					</>
				) : (
					<>
						<Text style={styles.sectionTitle}>EM CASO DE EMERGÊNCIA</Text>
						<Text style={styles.instruction}>
							Utilize o botão abaixo para pedir ajuda.
						</Text>

						<TouchableOpacity
							style={styles.emergencyButton}
							onPress={pedirAjuda}
							disabled={pedidoContagem}
						>
							<Text style={styles.emergencyButtonText}>
								{pedidoContagem ? 'ENVIANDO...' : '🆘 PEDIR AJUDA'}
							</Text>
						</TouchableOpacity>

						<View style={styles.contactBox}>
							<Text style={styles.contactTitle}>EMERGÊNCIA IMEDIATA</Text>
							<Text style={styles.contactNumber}>🚑 112</Text>
						</View>
					</>
				)}

				<View style={styles.bottomButtons}>
					<TouchableOpacity
						style={[styles.smallButton, styles.profileHomeButton]}
						onPress={irParaPerfil}
					>
						<Text style={styles.smallButtonText}>👤 Perfil</Text>
					</TouchableOpacity>

					<TouchableOpacity
						style={styles.logoutButton}
						onPress={handleLogout}
					>
						<Text style={styles.logoutText}>TERMINAR SESSÃO</Text>
					</TouchableOpacity>
				</View>

				{/* Overlay de Contagem Regressiva */}
				<ContagemRegressivaOverlay />
			</View>
		);
	}

	// ================== RETURN FINAL ==================
	return (
		<View style={styles.container}>
			<ActivityIndicator size="large" color="#e74c3c" />
			<Text style={styles.loadingText}>A carregar...</Text>

			{/* Overlay de Contagem Regressiva */}
			<ContagemRegressivaOverlay />
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexGrow: 1,
		padding: 20,
		backgroundColor: '#f8f9fa',
		justifyContent: 'center',
	},
	fullContainer: {
		flex: 1,
		backgroundColor: '#f8f9fa',
	},
	title: {
		fontSize: 32,
		fontWeight: 'bold',
		color: '#e74c3c',
		textAlign: 'center',
		marginBottom: 10,
	},
	subtitle: {
		fontSize: 16,
		color: '#7f8c8d',
		textAlign: 'center',
		marginBottom: 30,
	},
	// Header com foto
	homeHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 20,
		backgroundColor: 'white',
		padding: 15,
		borderRadius: 12,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 3,
		elevation: 2,
	},
	profileButton: {
		marginRight: 15,
	},
	homeProfilePhoto: {
		width: 60,
		height: 60,
		borderRadius: 30,
	},
	homePhotoPlaceholder: {
		backgroundColor: '#3498db',
		justifyContent: 'center',
		alignItems: 'center',
	},
	homePhotoPlaceholderText: {
		color: 'white',
		fontSize: 24,
		fontWeight: 'bold',
	},
	headerTextContainer: {
		flex: 1,
	},
	welcome: {
		fontSize: 20,
		color: '#2c3e50',
		fontWeight: '600',
	},
	firebaseStatus: {
		fontSize: 14,
		color: '#666',
		fontStyle: 'italic',
		marginTop: 2,
	},
	sectionLabel: {
		fontSize: 16,
		fontWeight: 'bold',
		color: '#2c3e50',
		marginTop: 15,
		marginBottom: 8,
	},
	sectionTitle: {
		fontSize: 20,
		fontWeight: 'bold',
		color: '#2c3e50',
		textAlign: 'center',
		marginTop: 20,
		marginBottom: 15,
	},
	instruction: {
		fontSize: 16,
		color: '#7f8c8d',
		textAlign: 'center',
		marginBottom: 20,
		lineHeight: 22,
	},
	input: {
		backgroundColor: 'white',
		padding: 14,
		borderRadius: 8,
		marginBottom: 12,
		borderWidth: 1,
		borderColor: '#ddd',
		fontSize: 16,
	},
	row: {
		flexDirection: 'row',
		justifyContent: 'space-between',
	},
	halfInput: {
		width: '48%',
	},
	primaryButton: {
		backgroundColor: '#e74c3c',
		padding: 16,
		borderRadius: 10,
		marginTop: 15,
		marginBottom: 12,
		alignItems: 'center',
	},
	buttonDisabled: {
		backgroundColor: '#95a5a6',
	},
	requiredText: {
		color: 'white',
		fontSize: 12,
		marginTop: 5,
		fontStyle: 'italic',
	},
	buttonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: 'bold',
		textAlign: 'center',
	},
	secondaryButton: {
		backgroundColor: 'transparent',
		padding: 14,
		borderRadius: 8,
		borderWidth: 2,
		borderColor: '#3498db',
		marginBottom: 12,
	},
	secondaryButtonText: {
		color: '#3498db',
		fontSize: 14,
		fontWeight: 'bold',
		textAlign: 'center',
	},
	optionCard: {
		backgroundColor: 'white',
		padding: 20,
		borderRadius: 12,
		marginBottom: 15,
		borderWidth: 3,
	},
	certifiedCard: {
		borderColor: '#e74c3c',
	},
	normalCard: {
		borderColor: '#3498db',
	},
	optionTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		color: '#2c3e50',
		marginBottom: 6,
	},
	optionDesc: {
		fontSize: 14,
		color: '#7f8c8d',
		marginBottom: 10,
	},
	optionBullet: {
		fontSize: 13,
		color: '#34495e',
		marginBottom: 4,
	},
	link: {
		color: '#3498db',
		fontSize: 15,
		textAlign: 'center',
		marginTop: 15,
		fontWeight: '600',
	},
	// Estilos para DatePicker
	dateInputContainer: {
		backgroundColor: 'white',
		padding: 14,
		borderRadius: 8,
		marginBottom: 8,
		borderWidth: 1,
		borderColor: '#ddd',
	},
	dateInputText: {
		fontSize: 16,
		color: '#2c3e50',
	},
	dateInputPlaceholder: {
		color: '#7f8c8d',
	},
	cancelDateButton: {
		backgroundColor: '#e74c3c',
		padding: 10,
		borderRadius: 8,
		marginBottom: 15,
		alignItems: 'center',
	},
	cancelDateButtonText: {
		color: 'white',
		fontWeight: 'bold',
	},
	// Estilos para Documento
	documentArea: {
		marginBottom: 20,
	},
	documentStatus: {
		fontSize: 14,
		fontWeight: 'bold',
		color: '#495057',
		marginBottom: 10,
		textAlign: 'center',
	},
	docButton: {
		padding: 20,
		borderRadius: 12,
		alignItems: 'center',
		justifyContent: 'center',
		borderWidth: 3,
		minHeight: 100,
		marginBottom: 10,
	},
	docButtonInactive: {
		backgroundColor: '#e9ecef',
		borderColor: '#adb5bd',
		borderStyle: 'dashed',
	},
	docButtonActive: {
		backgroundColor: '#d1ecf1',
		borderColor: '#0dcaf0',
		borderStyle: 'solid',
	},
	docIcon: {
		fontSize: 36,
		marginBottom: 8,
	},
	docMainText: {
		fontSize: 16,
		fontWeight: 'bold',
		textAlign: 'center',
		marginBottom: 4,
	},
	docSubText: {
		fontSize: 13,
		textAlign: 'center',
		color: '#6c757d',
	},
	// Estilos para Foto
	photoPreviewContainer: {
		alignItems: 'center',
		marginBottom: 15,
	},
	photoPreview: {
		width: 100,
		height: 100,
		borderRadius: 50,
		marginBottom: 10,
	},
	photoPreviewPlaceholder: {
		backgroundColor: '#95a5a6',
		justifyContent: 'center',
		alignItems: 'center',
	},
	photoPreviewText: {
		color: 'white',
		fontSize: 36,
		fontWeight: 'bold',
	},
	photoButtonsRow: {
		flexDirection: 'row',
		justifyContent: 'center',
		marginBottom: 20,
	},
	photoActionButton: {
		backgroundColor: '#3498db',
		paddingHorizontal: 20,
		paddingVertical: 10,
		borderRadius: 8,
		marginHorizontal: 5,
	},
	removePhotoPreviewButton: {
		backgroundColor: '#e74c3c',
		paddingHorizontal: 15,
		paddingVertical: 10,
		borderRadius: 8,
		marginHorizontal: 5,
	},
	loadingBox: {
		backgroundColor: '#fff3cd',
		padding: 15,
		borderRadius: 8,
		marginBottom: 15,
		alignItems: 'center',
	},
	loadingText: {
		color: '#856404',
		fontSize: 15,
		marginTop: 8,
		textAlign: 'center',
	},
	statusCard: {
		backgroundColor: 'white',
		padding: 18,
		borderRadius: 12,
		marginBottom: 18,
		alignItems: 'center',
		borderWidth: 2,
		borderColor: '#2ecc71',
	},
	statusTitle: {
		fontSize: 13,
		color: '#7f8c8d',
		marginBottom: 4,
	},
	statusActive: {
		fontSize: 24,
		fontWeight: 'bold',
		color: '#2ecc71',
		marginBottom: 8,
	},
	statusText: {
		fontSize: 13,
		color: '#7f8c8d',
		textAlign: 'center',
	},
	infoBox: {
		backgroundColor: '#e8f4fd',
		padding: 15,
		borderRadius: 10,
		marginBottom: 18,
	},
	infoTitle: {
		fontSize: 15,
		fontWeight: 'bold',
		color: '#0c5460',
		marginBottom: 8,
	},
	infoText: {
		fontSize: 14,
		color: '#2c3e50',
		marginBottom: 5,
	},
	infoSmall: {
		fontSize: 12,
		color: '#666',
		fontStyle: 'italic',
		marginTop: 8,
	},
	missionBox: {
		backgroundColor: '#fff3cd',
		padding: 18,
		borderRadius: 10,
		marginBottom: 18,
		alignItems: 'center',
		borderWidth: 2,
		borderColor: '#ffc107',
	},
	missionTitle: {
		fontSize: 17,
		fontWeight: 'bold',
		color: '#856404',
		marginBottom: 8,
	},
	missionText: {
		fontSize: 15,
		color: '#856404',
		textAlign: 'center',
		marginBottom: 12,
	},
	emergencyButton: {
		backgroundColor: '#e74c3c',
		padding: 22,
		borderRadius: 12,
		marginVertical: 18,
	},
	emergencyButtonText: {
		color: 'white',
		fontSize: 18,
		fontWeight: 'bold',
		textAlign: 'center',
	},
	contactBox: {
		backgroundColor: '#e8f4fd',
		padding: 14,
		borderRadius: 8,
		marginTop: 8,
	},
	contactTitle: {
		fontSize: 15,
		fontWeight: 'bold',
		color: '#0c5460',
		marginBottom: 8,
		textAlign: 'center',
	},
	contactNumber: {
		fontSize: 16,
		color: '#2c3e50',
		textAlign: 'center',
		fontWeight: 'bold',
	},
	map: {
		flex: 1,
	},
	emergencyHeader: {
		backgroundColor: '#e74c3c',
		padding: 15,
		paddingTop: Platform.OS === 'ios' ? 40 : 15,
	},
	emergencyTitle: {
		color: 'white',
		fontSize: 18,
		fontWeight: 'bold',
		textAlign: 'center',
		marginBottom: 5,
	},
	victimName: {
		color: 'white',
		fontSize: 16,
		fontWeight: '600',
		textAlign: 'center',
	},
	victimAddress: {
		color: 'rgba(255,255,255,0.9)',
		fontSize: 14,
		textAlign: 'center',
		marginTop: 3,
		marginBottom: 10,
	},
	distanceInfo: {
		flexDirection: 'row',
		justifyContent: 'space-around',
		marginTop: 8,
	},
	distanceItem: {
		color: 'white',
		fontSize: 15,
		fontWeight: '600',
		backgroundColor: 'rgba(0,0,0,0.2)',
		paddingHorizontal: 12,
		paddingVertical: 4,
		borderRadius: 15,
	},
	victimMarker: {
		backgroundColor: 'white',
		padding: 10,
		borderRadius: 20,
		borderWidth: 3,
		borderColor: '#e74c3c',
	},
	rescuerMarker: {
		backgroundColor: 'white',
		padding: 10,
		borderRadius: 20,
		borderWidth: 3,
		borderColor: '#3498db',
	},
	markerText: {
		fontSize: 18,
	},
	rescueActions: {
		position: 'absolute',
		bottom: 0,
		left: 0,
		right: 0,
		backgroundColor: 'white',
		padding: 20,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: -3 },
		shadowOpacity: 0.1,
		shadowRadius: 5,
		elevation: 10,
	},
	voiceNavButton: {
		backgroundColor: '#4285F4',
		padding: 18,
		borderRadius: 12,
		alignItems: 'center',
		marginBottom: 15,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.2,
		shadowRadius: 3,
		elevation: 4,
	},
	voiceNavIcon: {
		fontSize: 28,
		marginBottom: 5,
	},
	voiceNavTitle: {
		color: 'white',
		fontSize: 18,
		fontWeight: 'bold',
		textAlign: 'center',
	},
	voiceNavSubtitle: {
		color: 'rgba(255,255,255,0.9)',
		fontSize: 12,
		textAlign: 'center',
		marginTop: 3,
	},
	acceptMissionButton: {
		backgroundColor: '#27ae60',
		padding: 18,
		borderRadius: 12,
		alignItems: 'center',
		marginBottom: 15,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.2,
		shadowRadius: 3,
		elevation: 4,
	},
	acceptMissionIcon: {
		fontSize: 28,
		marginBottom: 5,
	},
	acceptMissionTitle: {
		color: 'white',
		fontSize: 18,
		fontWeight: 'bold',
		textAlign: 'center',
	},
	acceptMissionSubtitle: {
		color: 'rgba(255,255,255,0.9)',
		fontSize: 12,
		textAlign: 'center',
		marginTop: 3,
	},
	actionButtonsRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
	},
	smallButton: {
		flex: 1,
		padding: 14,
		borderRadius: 10,
		marginHorizontal: 5,
		alignItems: 'center',
	},
	smallButtonText: {
		color: 'white',
		fontWeight: 'bold',
		fontSize: 14,
	},
	confirmButton: {
		backgroundColor: '#27ae60',
	},
	cancelButton: {
		backgroundColor: '#95a5a6',
	},
	completeButton: {
		backgroundColor: '#f39c12',
	},
	highlightText: {
		fontWeight: 'bold',
		color: '#e74c3c',
	},
	missionDetail: {
		fontSize: 14,
		color: '#666',
		textAlign: 'center',
		marginBottom: 15,
		paddingHorizontal: 10,
	},
	missionButtons: {
		width: '100%',
	},
	continueButton: {
		backgroundColor: '#3498db',
	},
	availableBox: {
		backgroundColor: '#fff',
		padding: 20,
		borderRadius: 12,
		marginBottom: 20,
		borderWidth: 2,
		borderColor: '#e74c3c',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	alertText: {
		fontSize: 16,
		color: '#e74c3c',
		textAlign: 'center',
		marginBottom: 10,
		fontWeight: '600',
	},
	pedidosInfo: {
		marginVertical: 15,
		alignItems: 'center',
	},
	pedidosCount: {
		fontSize: 16,
		fontWeight: 'bold',
		color: '#2c3e50',
		marginBottom: 5,
	},
	pedidosInstruction: {
		fontSize: 14,
		color: '#7f8c8d',
		textAlign: 'center',
		fontStyle: 'italic',
	},
	cancelMissionButton: {
		backgroundColor: '#e74c3c',
		marginTop: 10,
	},
	noRequestsBox: {
		backgroundColor: '#f8f9fa',
		padding: 30,
		borderRadius: 12,
		alignItems: 'center',
		marginVertical: 20,
		borderWidth: 1,
		borderColor: '#ddd',
		borderStyle: 'dashed',
	},
	noRequestsIcon: {
		fontSize: 40,
		marginBottom: 10,
	},
	noRequestsText: {
		fontSize: 16,
		color: '#7f8c8d',
		textAlign: 'center',
		marginBottom: 5,
	},
	noRequestsSubtext: {
		fontSize: 14,
		color: '#95a5a6',
		textAlign: 'center',
		fontStyle: 'italic',
	},
	verifyButton: {
		backgroundColor: '#3498db',
		padding: 12,
		borderRadius: 8,
		marginTop: 15,
		marginBottom: 10,
	},
	verifyButtonText: {
		color: 'white',
		fontSize: 14,
		fontWeight: '600',
		textAlign: 'center',
	},
	// Perfil Screen
	headerContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 20,
	},
	backButton: {
		marginRight: 15,
	},
	backButtonText: {
		fontSize: 24,
		color: '#3498db',
	},
	profilePhotoSection: {
		alignItems: 'center',
		marginBottom: 30,
	},
	photoContainer: {
		position: 'relative',
	},
	profilePhoto: {
		width: 120,
		height: 120,
		borderRadius: 60,
		borderWidth: 4,
		borderColor: '#3498db',
	},
	photoPlaceholder: {
		backgroundColor: '#95a5a6',
		justifyContent: 'center',
		alignItems: 'center',
	},
	photoPlaceholderText: {
		color: 'white',
		fontSize: 48,
		fontWeight: 'bold',
	},
	photoLoading: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: 'rgba(0,0,0,0.5)',
		borderRadius: 60,
		justifyContent: 'center',
		alignItems: 'center',
	},
	photoButtons: {
		flexDirection: 'row',
		marginTop: 15,
		flexWrap: 'wrap',
		justifyContent: 'center',
	},
	photoButton: {
		backgroundColor: '#3498db',
		margin: 5,
		paddingHorizontal: 15,
		paddingVertical: 10,
	},
	removePhotoButton: {
		backgroundColor: '#e74c3c',
		margin: 5,
		paddingHorizontal: 15,
		paddingVertical: 10,
	},
	profileInfoBox: {
		backgroundColor: 'white',
		padding: 20,
		borderRadius: 12,
		marginBottom: 15,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 3,
		elevation: 2,
	},
	profileSectionTitle: {
		fontSize: 16,
		fontWeight: 'bold',
		color: '#2c3e50',
		marginBottom: 15,
		borderBottomWidth: 1,
		borderBottomColor: '#eee',
		paddingBottom: 8,
	},
	infoRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 12,
		paddingBottom: 8,
		borderBottomWidth: 1,
		borderBottomColor: '#f8f9fa',
	},
	infoLabel: {
		fontSize: 14,
		color: '#7f8c8d',
		fontWeight: '600',
		flex: 1,
	},
	infoValue: {
		fontSize: 14,
		color: '#2c3e50',
		fontWeight: '500',
		flex: 2,
		textAlign: 'right',
	},
	socorristaBadge: {
		color: '#e74c3c',
		fontWeight: 'bold',
	},
	userBadge: {
		color: '#3498db',
		fontWeight: 'bold',
	},
	certificationBadge: {
		color: '#27ae60',
		fontWeight: 'bold',
	},
	verifiedBadge: {
		color: '#27ae60',
		fontWeight: 'bold',
	},
	pendingBadge: {
		color: '#e74c3c',
		fontWeight: 'bold',
	},
	statsBox: {
		backgroundColor: 'white',
		padding: 20,
		borderRadius: 12,
		marginBottom: 15,
	},
	statsGrid: {
		flexDirection: 'row',
		justifyContent: 'space-around',
	},
	statItem: {
		alignItems: 'center',
	},
	statNumber: {
		fontSize: 24,
		fontWeight: 'bold',
		color: '#e74c3c',
	},
	statLabel: {
		fontSize: 12,
		color: '#7f8c8d',
		marginTop: 5,
	},
	// Bottom buttons
	bottomButtons: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginTop: 20,
	},
	profileHomeButton: {
		backgroundColor: '#3498db',
		flex: 1,
		marginRight: 10,
	},
	logoutButton: {
		padding: 14,
		flex: 1,
		marginLeft: 10,
		backgroundColor: '#e74c3c',
		borderRadius: 10,
		justifyContent: 'center',
		alignItems: 'center',
	},
	logoutText: {
		color: 'white',
		fontSize: 14,
		fontWeight: 'bold',
	},
	firebaseInfo: {
		fontSize: 12,
		color: '#2ecc71',
		textAlign: 'center',
		marginTop: 10,
		fontWeight: '600',
	},
	footer: {
		fontSize: 13,
		color: '#7f8c8d',
		textAlign: 'center',
		marginTop: 25,
		fontStyle: 'italic',
		paddingHorizontal: 15,
	},
	emailBox: {
		backgroundColor: '#e8f4fd',
		padding: 20,
		borderRadius: 12,
		alignItems: 'center',
		marginBottom: 20,
		borderWidth: 2,
		borderColor: '#3498db',
	},
	emailIcon: {
		fontSize: 40,
		marginBottom: 10,
	},
	emailAddress: {
		fontSize: 16,
		fontWeight: '600',
		color: '#2c3e50',
		textAlign: 'center',
		marginBottom: 5,
	},
	emailStatus: {
		fontSize: 14,
		fontWeight: 'bold',
		color: '#e74c3c',
	},
	warningBox: {
		backgroundColor: '#fff3cd',
		padding: 15,
		borderRadius: 10,
		marginBottom: 15,
		borderWidth: 2,
		borderColor: '#ffc107',
	},
	warningTitle: {
		fontSize: 16,
		fontWeight: 'bold',
		color: '#856404',
		marginBottom: 8,
		textAlign: 'center',
	},
	warningText: {
		fontSize: 14,
		color: '#856404',
		textAlign: 'center',
		marginBottom: 5,
	},
	warningSubtext: {
		fontSize: 13,
		color: '#856404',
		textAlign: 'center',
		fontStyle: 'italic',
	},
	highlight: {
		fontWeight: 'bold',
		color: '#e74c3c',
	},
	instructionsBox: {
		backgroundColor: '#d4edda',
		padding: 15,
		borderRadius: 10,
		marginBottom: 20,
	},
	instructionsTitle: {
		fontSize: 16,
		fontWeight: 'bold',
		color: '#155724',
		marginBottom: 10,
	},
	instruction: {
		fontSize: 14,
		color: '#155724',
		marginBottom: 6,
		paddingLeft: 10,
	},
	linkButton: {
		backgroundColor: '#6c757d',
		padding: 14,
		borderRadius: 8,
		marginTop: 10,
	},
	linkButtonText: {
		color: 'white',
		fontSize: 14,
		fontWeight: '600',
		textAlign: 'center',
	},
	profileNote: {
		fontSize: 12,
		color: '#95a5a6',
		textAlign: 'center',
		marginTop: 10,
		fontStyle: 'italic',
	},
	lastMissionText: {
		fontSize: 12,
		color: '#7f8c8d',
		textAlign: 'center',
		marginTop: 10,
		fontStyle: 'italic',
	},
	// Estilos para o overlay de contagem regressiva
	overlayContainer: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: 'rgba(0, 0, 0, 0.85)',
		justifyContent: 'center',
		alignItems: 'center',
		zIndex: 1000,
	},
	overlayBackground: {
		backgroundColor: 'white',
		padding: 30,
		borderRadius: 20,
		alignItems: 'center',
		width: '85%',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 10 },
		shadowOpacity: 0.3,
		shadowRadius: 20,
		elevation: 20,
	},
	pulsingCircle: {
		width: 140,
		height: 140,
		borderRadius: 70,
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 30,
		backgroundColor: '#e74c3c',
		shadowColor: '#e74c3c',
		shadowOffset: { width: 0, height: 0 },
		shadowOpacity: 0.7,
		shadowRadius: 20,
		elevation: 10,
	},
	pulsingText: {
		fontSize: 60,
		fontWeight: 'bold',
		color: 'white',
		textShadowColor: 'rgba(0, 0, 0, 0.3)',
		textShadowOffset: { width: 2, height: 2 },
		textShadowRadius: 5,
	},
	overlayTitle: {
		fontSize: 24,
		fontWeight: 'bold',
		color: '#e74c3c',
		marginBottom: 10,
		textAlign: 'center',
	},
	overlaySubtitle: {
		fontSize: 18,
		color: '#2c3e50',
		textAlign: 'center',
		marginBottom: 20,
		fontWeight: '600',
	},
	cancelOverlayButton: {
		backgroundColor: '#34495e',
		paddingVertical: 15,
		paddingHorizontal: 30,
		borderRadius: 10,
		marginTop: 10,
		width: '100%',
		alignItems: 'center',
	},
	cancelOverlayButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: 'bold',
	},
	overlayWarning: {
		fontSize: 14,
		color: '#7f8c8d',
		marginTop: 20,
		textAlign: 'center',
		fontStyle: 'italic',
	},
});
