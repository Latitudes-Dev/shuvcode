import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { Icon } from '../components/Icon';
import { spacing, radius, typography } from '../theme';
import type { Project } from '../hooks/useOpenCode';

interface ProjectsScreenProps {
  getProjects: () => Promise<Project[]>;
  onSelectProject?: (project: Project) => void;
}

export function ProjectsScreen({
  getProjects,
  onSelectProject,
}: ProjectsScreenProps) {
  const { theme, colors: c } = useTheme();
  const [projects, setProjects] = useState<Project[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    const data = await getProjects();
    setProjects(data);
    setLoading(false);
  }, [getProjects]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProjects();
    setRefreshing(false);
  }, [loadProjects]);

  const getProjectName = (project: Project) => {
    if (project.name) return project.name;
    if (project.path) {
      const parts = project.path.split('/');
      return parts[parts.length - 1] || project.path;
    }
    return 'Unknown Project';
  };

  const renderProject = ({ item }: { item: Project }) => {
    const name = getProjectName(item);
    
    return (
      <TouchableOpacity
        style={[styles.projectItem, { backgroundColor: c.bgCard, borderBottomColor: c.divider }]}
        onPress={() => onSelectProject?.(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.projectIcon, { backgroundColor: c.accentSubtle }]}>
          <Icon name="folder-open" size={20} color={c.accent} />
        </View>
        
        <View style={styles.projectContent}>
          <Text style={[theme.bodyMedium]} numberOfLines={1}>
            {name}
          </Text>
          {item.path && (
            <Text style={[theme.small, theme.textSecondary]} numberOfLines={1}>
              {item.path}
            </Text>
          )}
        </View>
        
        <Icon name="chevron-right" size={20} color={c.textMuted} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={theme.container}>
      {/* Header */}
      <View style={[theme.header]}>
        <View>
          <Text style={theme.title}>Projects</Text>
          <Text style={[theme.small, theme.textSecondary]}>
            {projects.length} {projects.length === 1 ? 'project' : 'projects'}
          </Text>
        </View>
      </View>

      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        renderItem={renderProject}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.accent}
          />
        }
        contentContainerStyle={[
          styles.list,
          projects.length === 0 && styles.emptyList
        ]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: c.accentSubtle }]}>
              <Icon name="folder-open" size={32} color={c.accent} />
            </View>
            <Text style={[theme.subtitle, { marginTop: spacing.lg }]}>
              {loading ? 'Loading...' : 'No Projects'}
            </Text>
            <Text style={[theme.body, theme.textSecondary, styles.emptyText]}>
              {loading 
                ? 'Fetching your projects' 
                : 'Open a project in OpenCode to see it here'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 100,
  },
  emptyList: {
    flex: 1,
  },
  projectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
  },
  projectIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectContent: {
    flex: 1,
    marginLeft: spacing.lg,
    marginRight: spacing.md,
    gap: spacing.xs,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
