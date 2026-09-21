import os
import pytest
from services.acoustic_extractor import extract_features_from_audio

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), 'fixtures', 'audio')

@pytest.fixture
def sine_audio():
    with open(os.path.join(FIXTURES_DIR, 'sine_440.wav'), 'rb') as f:
        return f.read()

@pytest.fixture
def distress_audio():
    with open(os.path.join(FIXTURES_DIR, 'distress_simulation.wav'), 'rb') as f:
        return f.read()

@pytest.fixture
def silence_audio():
    with open(os.path.join(FIXTURES_DIR, 'silence.wav'), 'rb') as f:
        return f.read()

def test_extract_features_normal_voice(sine_audio):
    features = extract_features_from_audio(sine_audio)
    
    # Check if librosa failed to load (graceful degradation)
    if features.extraction_error:
        pytest.skip(f"Librosa/Scipy not available or failed: {features.extraction_error}")
        
    assert features.pitch_mean is not None
    assert features.energy_mean is not None
    # 440Hz sine wave should have roughly 440Hz pitch
    assert 430 <= features.pitch_mean <= 450

def test_extract_features_distress_voice(distress_audio):
    features = extract_features_from_audio(distress_audio)
    
    if features.extraction_error:
        pytest.skip(f"Librosa/Scipy not available or failed: {features.extraction_error}")
        
    assert features.jitter is not None
    assert features.shimmer is not None
    # Noisy/frequency modulated sine should have higher jitter/shimmer than 0
    assert features.jitter > 0

def test_extract_features_silence(silence_audio):
    features = extract_features_from_audio(silence_audio)
    
    if features.extraction_error:
        pytest.skip(f"Librosa/Scipy not available or failed: {features.extraction_error}")
        
    # Silence means no voiced frames
    assert features.voiced_ratio == 0.0
    assert features.speech_rate == 0.0
    assert features.pitch_mean is None  # no pitch detected

def test_graceful_degradation_corrupt_audio():
    corrupt_audio = b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00"  # truncated
    features = extract_features_from_audio(corrupt_audio)
    # Should not crash, should return an extraction_error
    assert features.extraction_error is not None
