/**
 * Frontend for the "AI Insights" Jira issue panel.
 *
 * Built with UI Kit: only components exported by @forge/react can be used
 * (no <div>, <span>, etc.). The heavy lifting happens in the backend
 * resolvers (src/resolvers/index.js), which we call with `invoke()`.
 */
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Badge,
  Box,
  Button,
  Heading,
  Inline,
  Link,
  List,
  ListItem,
  LoadingButton,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Text,
} from '@forge/react';
import { invoke } from '@forge/bridge';

// Lozenge colour for each confidence level.
const CONFIDENCE_APPEARANCE = { high: 'success', medium: 'inprogress', low: 'moved' };

/** Formats an ISO timestamp for the "last analysed" line. */
function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** A bulleted list that renders nothing when there are no items. */
const BulletList = ({ items }) =>
  items?.length ? (
    <List type="unordered">
      {items.map((item, index) => (
        <ListItem key={index}>{item}</ListItem>
      ))}
    </List>
  ) : null;

/** The "Summary" section. */
const SummarySection = ({ analysis }) => (
  <Stack space="space.100">
    <Heading size="small">Summary</Heading>
    <Text>{analysis.tldr || 'No summary was produced.'}</Text>
    {analysis.keyPoints?.length > 0 && (
      <>
        <Text weight="bold">Key points</Text>
        <BulletList items={analysis.keyPoints} />
      </>
    )}
    {analysis.nextSteps?.length > 0 && (
      <>
        <Text weight="bold">Suggested next steps</Text>
        <BulletList items={analysis.nextSteps} />
      </>
    )}
  </Stack>
);

/** The "Effort estimate" section, including the "Set story points" action. */
const EstimateSection = ({ analysis, onApply, applying, applyMessage }) => {
  const { estimate, pointsField, currentPoints, referenceCount } = analysis;
  const alreadySet = estimate.points != null && Number(currentPoints) === estimate.points;

  return (
    <Stack space="space.100">
      <Heading size="small">Effort estimate</Heading>

      {estimate.points == null ? (
        <Text>The AI could not produce an estimate for this issue.</Text>
      ) : (
        <Inline space="space.100" alignBlock="center">
          <Badge appearance="primary">{`${estimate.points} pts`}</Badge>
          <Lozenge appearance={CONFIDENCE_APPEARANCE[estimate.confidence]}>
            {`${estimate.confidence} confidence`}
          </Lozenge>
          {currentPoints != null && <Text color="color.text.subtle">{`Current: ${currentPoints} pts`}</Text>}
        </Inline>
      )}

      {estimate.rationale && <Text>{estimate.rationale}</Text>}

      {estimate.missingInfo && (
        <SectionMessage appearance="warning" title="Would improve the estimate">
          <Text>{estimate.missingInfo}</Text>
        </SectionMessage>
      )}

      {estimate.similarIssues?.length > 0 && (
        <>
          <Text weight="bold">Similar estimated issues</Text>
          <List type="unordered">
            {estimate.similarIssues.map((issue) => (
              <ListItem key={issue.key}>
                <Link href={`/browse/${issue.key}`} openNewTab>
                  {issue.key}
                </Link>
                {` (${issue.points} pts): ${issue.summary}`}
              </ListItem>
            ))}
          </List>
        </>
      )}

      <Text size="small" color="color.text.subtlest">
        {referenceCount > 0
          ? `Calibrated against ${referenceCount} estimated issue(s) in this project.`
          : 'No estimated issues in this project yet, so this estimate is based on the issue content only.'}
      </Text>

      {pointsField && estimate.points != null && (
        <Inline space="space.100" alignBlock="center">
          <LoadingButton appearance="primary" isLoading={applying} isDisabled={alreadySet} onClick={onApply}>
            {alreadySet ? `${pointsField.name} is ${estimate.points}` : `Set ${pointsField.name} to ${estimate.points}`}
          </LoadingButton>
          {applyMessage && <Text color="color.text.subtle">{applyMessage}</Text>}
        </Inline>
      )}
    </Stack>
  );
};

const App = () => {
  const [analysis, setAnalysis] = useState(null);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState('');
  const [error, setError] = useState('');

  // On first render, show the last saved analysis (no LLM call needed).
  useEffect(() => {
    invoke('getSavedAnalysis')
      .then((result) => {
        if (result?.analysis) setAnalysis(result.analysis);
      })
      .catch(() => {
        /* a missing saved result is fine; the user can analyse */
      })
      .finally(() => setLoadingSaved(false));
  }, []);

  const analyze = async () => {
    setAnalyzing(true);
    setError('');
    setApplyMessage('');
    try {
      const result = await invoke('analyzeIssue');
      if (result?.error) setError(result.error);
      else setAnalysis(result.analysis);
    } catch (e) {
      setError(e?.message || 'The analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const applyEstimate = async () => {
    setApplying(true);
    setApplyMessage('');
    try {
      const result = await invoke('applyEstimate', { points: analysis.estimate.points });
      if (result?.error) {
        setApplyMessage(result.error);
      } else {
        setAnalysis({ ...analysis, currentPoints: result.points });
        setApplyMessage('Saved. Refresh the page to see it in the issue fields.');
      }
    } catch (e) {
      setApplyMessage(e?.message || 'Could not update story points.');
    } finally {
      setApplying(false);
    }
  };

  if (loadingSaved) {
    return <Spinner label="Loading AI insights" />;
  }

  return (
    <Stack space="space.200">
      {error && (
        <SectionMessage appearance="error" title="Analysis failed">
          <Text>{error}</Text>
        </SectionMessage>
      )}

      {analyzing && (
        <Inline space="space.100" alignBlock="center">
          <Spinner size="small" label="Analysing" />
          <Text>Reading the issue and similar work. This takes about 10 to 20 seconds.</Text>
        </Inline>
      )}

      {!analysis && !analyzing && (
        <Stack space="space.100">
          <Text>Get an AI summary of this issue and a story point estimate based on similar work in this project.</Text>
          <Box>
            <Button appearance="primary" onClick={analyze}>
              Analyze issue
            </Button>
          </Box>
        </Stack>
      )}

      {analysis && (
        <>
          <SummarySection analysis={analysis} />
          <EstimateSection
            analysis={analysis}
            onApply={applyEstimate}
            applying={applying}
            applyMessage={applyMessage}
          />
          <Inline space="space.100" alignBlock="center" spread="space-between">
            <Text size="small" color="color.text.subtlest">
              {`Analysed ${formatTime(analysis.analyzedAt)}`}
            </Text>
            <Button appearance="subtle" onClick={analyze} isDisabled={analyzing}>
              Re-analyze
            </Button>
          </Inline>
        </>
      )}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
