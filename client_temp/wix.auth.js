// Filename: public/auth.js 
import wixLocation from 'wix-location';
import {fetch} from 'wix-fetch';
import {session} from 'wix-storage';
import wixData from 'wix-data';

var smosad = '';
var smosad2 = '';

const LOGIN_URL = '/';
const UNAUTHORIZED_URL = '/no-license';
const LOGOUT_URL = 'https://auth.uingame.co.il/logout';
const SUCCESS_URL = '/training-materials-idm';
const VERIFICATION_URL = 'https://auth.uingame.co.il/login/verify';
const COLLECTION = 'Permissions';
const LOG = 'SessionLog';
const SUBJECTS = 'Subjects';

// Called from 'createSession' page
export function createSession() {
  const token = wixLocation.query.token;
  if (!token) {
	console.log('no token')
  	wixLocation.to(LOGIN_URL);
  	return;
  }
  
  fetch(`${VERIFICATION_URL}?token=${token}`)
    .then(httpResponse => httpResponse.ok ? httpResponse.json() : Promise.reject("Fetch did not succeed"))
	.then(user => {

		if (!!user.mosad_3){
			if (!!user.mosad) {
				user.mosad = user.mosad_3 + ',' + user.mosad
			} else {
				user.mosad = user.mosad_3
			}
		}

		if (user.mosad_2) {
			console.log("inside mosad 2");
			const mArray = user.mosad_2.split(":");
			const mArray2 = mArray[0].split("[");
			smosad2 = mArray2[1];
			console.log("done splitting");

			user.mosad = user.mosad +','+ smosad2;
		}

		if (user.mosad && !Array.isArray(user.mosad)) {
			smosad = user.mosad.split(',').map(m => m.trim())
			user.mosad = smosad;

		}
		return user
	})
    .then(user => checkLicense(user).then(hasLicense => {
		logSession(user, hasLicense)
			.then(() => {
				session.setItem('user', JSON.stringify(user));
				if (hasLicense) {
				  // Trigger LRS connect event (best-effort, non-blocking)
				  const lrsPromise = fetch('https://auth.uingame.co.il/lrs/connect', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify({ token, pageUrl: wixLocation.url, clientTs: Date.now() })
				  }).catch(err => {
					console.log('[LRS] Connect call failed (non-blocking):', err);
				  });
				  
				  getRedirectUrl(user).then(url => {
					// give LRS a chance to send, but never block the user on failure
					lrsPromise.finally(() => wixLocation.to(url));
				  });
				} else {
				  wixLocation.to(UNAUTHORIZED_URL);
				}
				
			})
	}))
    .catch(err => {
	  console.log("Error occurred")
      console.log(err);
 	  wixLocation.to(LOGIN_URL);
    });
}

function getRedirectUrl({mosad, isStudent, kita}) {
	return wixData.query(COLLECTION)
		.hasSome('mosad', mosad)
		.find()
		.then(results => {
			const permissions = results.items && (isStudent ? results.items.filter(item => !item.kita || item.kita.split(',').includes(kita)) : results.items)
			if (permissions && permissions.length === 1) {
				return wixData.query(SUBJECTS)
					.eq('subject', permissions[0].subject)
					.find()
					.then(subjectResults => {
						if (!subjectResults.items || subjectResults.items.length === 0) {
							return SUCCESS_URL
						}
						let items = subjectResults.items
						if (isStudent) {
							items = items.filter(item => !item.teachersOnly)
						} else {
							items = items.sort(item => item.teachersOnly ? -1 : 0)
						}
						
						return (items[0] && items[0].url) ? ('/' + items[0].url) : SUCCESS_URL
					})
			}
			return SUCCESS_URL;
		})
}

function checkLicense({mosad, isStudent, kita}) {
  return wixData.query(COLLECTION)
  	.hasSome('mosad', mosad)
  	.find()
  	.then(({items}) => {
		if (!items[0]) {
			return false
		}
		if (!isStudent || items.some(r => !r.kita)) {
			return true
		}
		return getAllowedKitas(items).includes(kita)
	})
}

function logSession(user, hasLicense) {
  const {displayName, mosad, isStudent, kita} = user;
  return wixData.insert(LOG, {
	name: displayName,
	mosad,
	isStudent,
	kita,
	hasLicense
});
}

function getAllowedKitas(items) {
	if (!items || items.some(({kita}) => !kita)) {
		return []
	}
	
	return items.reduce((ret, {kita}) => {
		kita.split(',').forEach(k => {
			if (!ret.includes(k)) {
				ret.push(k)
			}
		})
		return ret
	}, []);
}

export function verifyLogin() {
	wixData.query(SUBJECTS)
		.eq('url', wixLocation.path[0])
		.find()
		.then(subjectResults => {
			const item = subjectResults.items[0]
			if (!item) {
				return
			}
			const {subject, teachersOnly} = item

			const user = getUser();
			if (!user) {
				wixLocation.to(LOGIN_URL);
				return
			}
			// user is an object of this structure. its received from the heroku server === {mosad: 123, isStudent: false, kita: '5'}
			const {mosad, isStudent, kita} = user;
			// code for allowing all non students to enter regardless of their mosad.
			//if (!isStudent) {
			//	return
			//}
			// end code for allowing all non students to enter regardless of their mosad.
			let query = wixData.query(COLLECTION).hasSome('mosad', mosad) // $hasSome is $eq and also $in
			if (subject) {
				query = query.eq('subject', subject)
			}
			query.find()
				.then(results => {
					const permissions = results.items;
					if (!permissions[0] || (teachersOnly && isStudent)) {
						wixLocation.to(UNAUTHORIZED_URL);
						return;
					}
					if (isStudent) {
						const allowedKitas = getAllowedKitas(permissions)
						if (allowedKitas.length > 0 && !allowedKitas.includes(kita)) {
							wixLocation.to(UNAUTHORIZED_URL);
						}
					}
				})
				.catch(err => {
					console.log(err);
				});
		})
}

export function getUser() {
  const user = session.getItem('user');
  if (user) {
  	return JSON.parse(user);
  }
}

export function logout() {
  session.clear();
  wixLocation.to(LOGOUT_URL);
}