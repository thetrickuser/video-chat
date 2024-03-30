import "./style.css";

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  addDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAk0RsvoFSWJTIw3Aw5T2gjVcuKoXAS1bk",
  authDomain: "video-chat-bbd5a.firebaseapp.com",
  projectId: "video-chat-bbd5a",
  storageBucket: "video-chat-bbd5a.appspot.com",
  messagingSenderId: "960540350991",
  appId: "1:960540350991:web:57de9342a0c7bb6a05617a",
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

const servers = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById("webcamButton");
const webcamVideo = document.getElementById("webcamVideo");
const callButton = document.getElementById("callButton");
const callInput = document.getElementById("callInput");
const answerButton = document.getElementById("answerButton");
const remoteVideo = document.getElementById("remoteVideo");
const hangupButton = document.getElementById("hangupButton");

// 1. Setup media sources

webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

// 2. Create an offer
callButton.onclick = async () => {
  // Reference Firestore collections for signaling
  const callDocRef = doc(collection(firestore, "calls"));
  const offerCandidatesCollectionRef = collection(
    callDocRef,
    "offerCandidates"
  );
  const answerCandidatesCollectionRef = collection(
    callDocRef,
    "answerCandidates"
  );

  callInput.value = callDocRef.id;

  // Get candidates for caller, save to db
  pc.onicecandidate = async (event) => {
    event.candidate &&
      (await addDoc(offerCandidatesCollectionRef, event.candidate.toJSON()));
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await setDoc(callDocRef, { offer });

  // Listen for remote answer
  onSnapshot(callDocRef, (snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  onSnapshot(answerCandidatesCollectionRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDocRef = doc(collection(firestore, "calls"), callId);
  const offerCandidatesCollectionRef = collection(
    callDocRef,
    "offerCandidates"
  );
  const answerCandidatesCollectionRef = collection(
    callDocRef,
    "answerCandidates"
  );

  pc.onicecandidate = async (event) => {
    event.candidate &&
      (await addDoc(answerCandidatesCollectionRef, event.candidate.toJSON()));
  };

  const callData = (await getDoc(callDocRef)).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await updateDoc(callDocRef, { answer });

  onSnapshot(offerCandidatesCollectionRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === "added") {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};
