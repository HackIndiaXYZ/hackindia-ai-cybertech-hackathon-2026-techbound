

import sys, pathlib
if sys.platform == "win32":
    pathlib.PosixPath = pathlib.WindowsPath

import torch
import numpy as np
import cv2
from pathlib import Path
import json

class HierarchicalClassifier:
    """
    Two-stage classifier:
    1. Gating model determines which group (0, 1, 2)
    2. Specialist model predicts the actual word
    """
    
    def __init__(self, gating_model_path, specialist_paths, device='mps'):
        """
        Args:
            gating_model_path: Path to gating model checkpoint
            specialist_paths: List of paths to specialist model checkpoints
                             [group_0_model.pth, group_1_model.pth, group_2_model.pth]
            device: 'cuda' or 'cpu'
        """
        self.device = device
        
        print(f"\n{'='*70}")
        print(f"LOADING HIERARCHICAL CLASSIFIER")
        print(f"{'='*70}")
        
        print(f"\n1. Loading Gating Model...")
        gating_checkpoint = torch.load(gating_model_path, map_location=self.device, weights_only=False)
        self.gating_config = gating_checkpoint['config']

        if hasattr(self.gating_config, 'DEVICE'):
            self.gating_config.DEVICE = self.device
        
        from models.two_stream_transformer import create_model
        self.gating_model = create_model(self.gating_config)
        self.gating_model.load_state_dict(gating_checkpoint['model_state_dict'])
        self.gating_model.to(self.device) 
        self.gating_model.eval()
        print(f"   ✓ Gating model loaded (3 groups)")
        

        print(f"\n2. Loading Specialist Model Metadata...")
        self.specialist_paths = specialist_paths
        self.specialist_models = [None] * len(specialist_paths)
        self.specialist_class_names = []
        
        for i, path in enumerate(specialist_paths):
            checkpoint = torch.load(path, map_location=self.device, weights_only=False)
            class_names = checkpoint['class_names']
            self.specialist_class_names.append(class_names)
            del checkpoint
            import gc
            gc.collect()
            print(f"   ✓ Group {i} metadata loaded ({len(class_names)} words)")
        
        print(f"\n{'='*70}")
        print(f"✓ Hierarchical Classifier Ready (Specialists load on-demand)")
        print(f"{'='*70}\n")

    def get_specialist_model(self, group_idx):
        """Loads only the needed specialist model into memory, unloading others to stay within free-tier RAM."""
        if self.specialist_models[group_idx] is None:
            for i in range(len(self.specialist_models)):
                if self.specialist_models[i] is not None:
                    del self.specialist_models[i]
                    self.specialist_models[i] = None
            import gc
            gc.collect()

            print(f"Loading Specialist Model for Group {group_idx} on {self.device}...")
            path = self.specialist_paths[group_idx]
            checkpoint = torch.load(path, map_location=self.device, weights_only=False)
            config = checkpoint['config']
            if hasattr(config, 'DEVICE'):
                config.DEVICE = self.device
            from models.two_stream_transformer import create_model
            model = create_model(config)
            model.load_state_dict(checkpoint['model_state_dict'])
            model.to(self.device)
            model.eval()
            self.specialist_models[group_idx] = model
            del checkpoint
            gc.collect()
            print(f"✓ Specialist Model for Group {group_idx} loaded!")

        return self.specialist_models[group_idx]
    
    @torch.no_grad()
    def predict(self, frames, landmarks, return_probabilities=False):
        """
        Two-stage prediction
        
        Args:
            frames: (T, C, H, W) numpy array or torch tensor
            landmarks: (T, 154) numpy array or torch tensor
            return_probabilities: If True, return confidence scores
        
        Returns:
            predicted_word: str
            group_predicted: int
            confidence: float (if return_probabilities=True)
        """

        if isinstance(frames, np.ndarray):
            frames = torch.from_numpy(frames).float()
        if isinstance(landmarks, np.ndarray):
            landmarks = torch.from_numpy(landmarks).float()
        
        frames = frames.unsqueeze(0).to(self.device)  # (1, T, C, H, W)
        landmarks = landmarks.unsqueeze(0).to(self.device)  # (1, T, 154)
        
        gating_logits = self.gating_model(frames, landmarks)  # (1, 3)
        gating_probs = torch.softmax(gating_logits, dim=1)
        group_predicted = gating_probs.argmax(dim=1).item()
        group_confidence = gating_probs[0, group_predicted].item()
        
        print(f"\n[Stage 1] Gating Model:")
        print(f"  Predicted Group: {group_predicted}")
        print(f"  Confidence: {group_confidence:.2%}")
        print(f"  All group probabilities: {gating_probs[0].cpu().numpy()}")
        
        specialist_model = self.get_specialist_model(group_predicted)
        specialist_logits = specialist_model(frames, landmarks)  # (1, num_words)
        specialist_probs = torch.softmax(specialist_logits, dim=1)
        word_idx = specialist_probs.argmax(dim=1).item()
        word_confidence = specialist_probs[0, word_idx].item()
        
        predicted_word = self.specialist_class_names[group_predicted][word_idx]
        
        print(f"\n[Stage 2] Specialist Model (Group {group_predicted}):")
        print(f"  Predicted Word: '{predicted_word}'")
        print(f"  Confidence: {word_confidence:.2%}")
        
        # Overall confidence (product of both stages)
        overall_confidence = group_confidence * word_confidence
        
        print(f"\n[Final] Overall Confidence: {overall_confidence:.2%}")
        
        if return_probabilities:
            return predicted_word, group_predicted, overall_confidence, {
                'gating_probs': gating_probs[0].cpu().numpy(),
                'specialist_probs': specialist_probs[0].cpu().numpy()
            }
        
        return predicted_word, group_predicted, overall_confidence
    
    def predict_batch(self, frames_batch, landmarks_batch):
        """
        Batch prediction (more efficient for multiple samples)
        
        Args:
            frames_batch: (B, T, C, H, W) tensor
            landmarks_batch: (B, T, 154) tensor
        
        Returns:
            predictions: List of (word, group, confidence) tuples
        """
        frames_batch = frames_batch.to(self.device)
        landmarks_batch = landmarks_batch.to(self.device)

        with torch.no_grad():
            gating_logits = self.gating_model(frames_batch, landmarks_batch)
            gating_probs = torch.softmax(gating_logits, dim=1)
            groups_predicted = gating_probs.argmax(dim=1)
        
        predictions = []
        for i in range(len(frames_batch)):
            group = groups_predicted[i].item()
            group_conf = gating_probs[i, group].item()

            specialist_model = self.specialist_models[group]
            specialist_logits = specialist_model(
                frames_batch[i:i+1], 
                landmarks_batch[i:i+1]
            )
            specialist_probs = torch.softmax(specialist_logits, dim=1)
            word_idx = specialist_probs.argmax(dim=1).item()
            word_conf = specialist_probs[0, word_idx].item()
            
            word = self.specialist_class_names[group][word_idx]
            overall_conf = group_conf * word_conf
            
            predictions.append((word, group, overall_conf))
        
        return predictions


class HierarchicalInference:
    """
    Complete hierarchical inference pipeline with video preprocessing
    Combines HierarchicalClassifier with video preprocessing
    """
    
    def __init__(self, gating_model_path, specialist_paths, device='mps'):
        """
        Args:
            gating_model_path: Path to gating model checkpoint
            specialist_paths: List of paths to specialist model checkpoints
            device: 'cuda' or 'cpu'
        """
        import sys
        import warnings
        import os
        warnings.filterwarnings('ignore')
        os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
        os.environ['GLOG_minloglevel'] = '3'
        
        # Add project root to path if needed
        project_root = Path(__file__).parent
        if str(project_root) not in sys.path:
            sys.path.append(str(project_root))
        
        from preprocessing import HandSignDatasetPreprocessor, suppress_stderr
        from configs.config import Config
        
        self.device = device
        
        # Load hierarchical classifier
        self.classifier = HierarchicalClassifier(
            gating_model_path=gating_model_path,
            specialist_paths=specialist_paths,
            device=self.device
        )
        
        # Setup config and preprocessor
        self.config = Config()
        self.preprocessor = HandSignDatasetPreprocessor(
            config=self.config,
            input_dir=".",
            output_dir=".",
            augment=False,
            verbose=False
        )
        print("✓ Preprocessor initialized")
        
        self.mp = None
        self._init_mediapipe()
    
    def _init_mediapipe(self):
        """
        Initialize MediaPipe models (video → landmark extraction only).

        Deliberately non-fatal. MediaPipe's legacy `solutions` API was removed from
        the wheels the Hub installs, and this object is only needed to turn a raw
        VIDEO into landmarks. The streaming path (`POST /predict/landmarks`, the
        WebSocket, and therefore the web app — the browser extracts landmarks with
        MediaPipe Tasks and sends them) feeds `classifier.predict()` directly and
        never touches this. Letting the legacy import raise used to disable the whole
        dynamic model with "module 'mediapipe' has no attribute 'solutions'".
        """
        try:
            import mediapipe as mp
            from preprocessing import suppress_stderr

            if not hasattr(mp, 'solutions'):
                raise AttributeError(
                    f"mediapipe {getattr(mp, '__version__', '?')} has no legacy `solutions` API"
                )

            with suppress_stderr():
                self.mp_pose = mp.solutions.pose
                self.mp_hands = mp.solutions.hands
            self.mp = mp
        except Exception as e:
            self.mp_pose = None
            self.mp_hands = None
            print(f"⚠️ MediaPipe legacy solutions unavailable ({e}); "
                  f"video preprocessing disabled, landmark streaming still works.")
    
    def preprocess_video(self, video_path):
        """
        Preprocess a single video
        
        Args:
            video_path: Path to video file
        Returns:
            frames: np.array of shape (T, H, W, 3)
            landmarks: np.array of shape (T, 154)
        """
        from preprocessing import suppress_stderr
        
        video_path = Path(video_path)
        
        if not video_path.exists():
            raise FileNotFoundError(f"Video not found: {video_path}")

        if self.mp_pose is None or self.mp_hands is None:
            raise RuntimeError(
                "Raw-video preprocessing needs MediaPipe's legacy `solutions` API, which the "
                "installed mediapipe build does not provide. Send landmarks instead "
                "(POST /predict/landmarks or the /ws/predict WebSocket), or install a "
                "mediapipe build that still ships `solutions`."
            )
        
        print(f"\nPreprocessing: {video_path.name}")

        with suppress_stderr():
            pose = self.mp_pose.Pose(
                static_image_mode=False,
                model_complexity=1,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5
            )
            
            hands = self.mp_hands.Hands(
                static_image_mode=False,
                max_num_hands=2,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
                model_complexity=1
            )
        
        try:
            # Preprocess video
            frames, landmarks = self.preprocessor.preprocess_video(
                video_path,
                pose,
                hands,
                self.config.TARGET_COUNT
            )
            
            print(f"  ✓ Extracted {len(frames)} frames")
            print(f"  ✓ Landmarks shape: {landmarks.shape}")
            
            valid_frames = np.sum(np.any(landmarks != 0, axis=1))
            print(f"  ✓ Valid landmark frames: {valid_frames}/{len(landmarks)}")
            
            if valid_frames < 5:
                print(f"  ⚠️  Warning: Very few valid landmarks detected!")
        
        finally:
            hands.close()
            pose.close()
        
        return frames, landmarks
    
    def prepare_model_input(self, frames, landmarks):
        """
        Convert preprocessed data to model input tensors
        
        Args:
            frames: np.array of shape (T, H, W, 3) - BGR frames
            landmarks: np.array of shape (T, 154)
        Returns:
            frames_tensor: torch.Tensor of shape (T, 3, H, W)
            landmarks_tensor: torch.Tensor of shape (T, 154)
        """
        T = len(frames)
        H, W = self.config.FRAME_SIZE
        
        # Process frames
        processed_frames = np.zeros((T, 3, H, W), dtype=np.float32)
        
        for i, frame in enumerate(frames):
            frame = np.asarray(frame, dtype=np.uint8)
            
            if frame.size == 0:
                continue
            
            frame = cv2.resize(frame, (W, H))
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame = frame.astype(np.float32) / 255.0
            frame = frame.transpose(2, 0, 1)
            
            processed_frames[i] = frame
        
        # Process landmarks
        landmarks = landmarks.astype(np.float32)

        frames_tensor = torch.from_numpy(processed_frames).float()  # (T, 3, H, W)
        landmarks_tensor = torch.from_numpy(landmarks).float()  # (T, 154)
        
        return frames_tensor, landmarks_tensor
    
    def predict(self, video_path, top_k=5):
        """
        Perform hierarchical inference on a single video
        
        Args:
            video_path: Path to video file
            top_k: Number of top predictions to return (for specialist model)
        Returns:
            dict with predictions and probabilities
        """

        frames, landmarks = self.preprocess_video(video_path)

        if len(frames) == 0:
            print("⚠️ No frames extracted from video; returning empty prediction.", file=sys.stdout)
            return {
                'video_path': str(video_path),
                'group_predicted': 0,
                'gating_confidence': 0.0,
                'top_prediction': {
                    'class': 'None',
                    'group': 0,
                    'overall_confidence': 0.0,
                    'specialist_confidence': 0.0
                },
                'all_predictions': [],
                'gating_probs': [0.0, 0.0, 0.0]
            }

        frames_tensor, landmarks_tensor = self.prepare_model_input(frames, landmarks)
        
        print(f"\nRunning hierarchical inference...")
        predicted_word, group_predicted, overall_confidence, probs = self.classifier.predict(
            frames_tensor,
            landmarks_tensor,
            return_probabilities=True
        )

        def safe_float(v):
            try:
                val = float(v)
                if np.isnan(val) or np.isinf(val):
                    return 0.0
                return val
            except Exception:
                return 0.0

        overall_confidence = safe_float(overall_confidence)
        
        specialist_probs = torch.from_numpy(probs['specialist_probs'])
        top_probs, top_indices = torch.topk(specialist_probs, k=min(top_k, len(specialist_probs)))
        
        specialist_class_names = self.classifier.specialist_class_names[group_predicted]
        
        all_predictions = []
        for idx, prob in zip(top_indices.numpy(), top_probs.numpy()):
            p_val = safe_float(prob)
            all_predictions.append({
                'class': specialist_class_names[idx],
                'class_id': int(idx),
                'probability': p_val,
                'confidence_percent': safe_float(p_val * 100)
            })

        print(f"\n{'='*70}")
        print(f"HIERARCHICAL PREDICTION RESULTS")
        print(f"{'='*70}")
        print(f"Video: {Path(video_path).name}")
        print(f"Group: {group_predicted}")
        print(f"Overall Confidence: {overall_confidence:.2%}\n")
        
        print(f"Top {len(all_predictions)} predictions from Group {group_predicted}:")
        for i, pred in enumerate(all_predictions, 1):
            print(f"{i}. {pred['class']:<20} - {pred['confidence_percent']:6.2f}%")
        
        print(f"{'='*70}\n")
        
        gating_probs_raw = probs.get('gating_probs')
        gating_probs_clean = [safe_float(gp) for gp in gating_probs_raw] if gating_probs_raw is not None else [0.0, 0.0, 0.0]
        
        return {
            'video_path': str(video_path),
            'group_predicted': int(group_predicted),
            'gating_confidence': safe_float(probs['gating_probs'][group_predicted]) if 'gating_probs' in probs else 0.0,
            'top_prediction': {
                'class': predicted_word,
                'group': int(group_predicted),
                'overall_confidence': overall_confidence,
                'specialist_confidence': safe_float(probs['specialist_probs'].max()) if 'specialist_probs' in probs else 0.0
            },
            'all_predictions': all_predictions,
            'gating_probs': gating_probs_clean
        }
    
    def predict_batch(self, video_paths, top_k=5):
        """
        Perform inference on multiple videos
        
        Args:
            video_paths: List of video file paths
            top_k: Number of top predictions to return
        Returns:
            List of prediction dictionaries
        """
        results = []
        
        for video_path in video_paths:
            try:
                result = self.predict(video_path, top_k=top_k)
                results.append(result)
            except Exception as e:
                print(f"Error processing {video_path}: {e}")
                results.append({
                    'video_path': str(video_path),
                    'error': str(e)
                })
        
        return results

